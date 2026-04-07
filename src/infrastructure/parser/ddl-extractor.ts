import { parse } from "pgsql-parser";
import type { Column, Index, Relation, Table } from "../../domain/model/types.js";

export interface DdlExtractResult {
	tables: Table[];
	relations: Relation[];
}

// biome-ignore lint/suspicious/noExplicitAny: pgsql-parser AST is untyped
type AstNode = any;

// PG internal type names → user-facing aliases
const PG_TYPE_ALIASES: Record<string, string> = {
	int2: "smallint",
	int4: "integer",
	int8: "bigint",
	float4: "real",
	float8: "double precision",
	bool: "boolean",
	varchar: "varchar",
	bpchar: "char",
	timestamptz: "timestamp with time zone",
	timetz: "time with time zone",
};

function resolveTypeName(typeName: AstNode): string {
	const names: string[] = (typeName.names ?? []).map((n: AstNode) => n.String?.str).filter(Boolean);
	// pg_catalog prefix is internal — strip it
	let baseName = names.filter((n) => n !== "pg_catalog").join(".");
	baseName = PG_TYPE_ALIASES[baseName] ?? baseName;
	const typmods = typeName.typmods ?? [];
	if (typmods.length > 0) {
		const modValues = typmods.map((m: AstNode) => {
			if (m.A_Const?.val?.Integer) return String(m.A_Const.val.Integer.ival);
			if (m.A_Const?.val?.Float) return m.A_Const.val.Float.str;
			return "";
		});
		return `${baseName}(${modValues.join(",")})`;
	}
	// ARRAY型: arrayBounds が存在すれば [] を付与
	if (typeName.arrayBounds && typeName.arrayBounds.length > 0) {
		return `${baseName}[]`;
	}
	return baseName;
}

function deparseExpr(node: AstNode): string {
	if (node.A_Const) {
		const val = node.A_Const.val;
		if (val.Integer) return String(val.Integer.ival);
		if (val.Float) return val.Float.str;
		if (val.String) return `'${val.String.str}'`;
		if (val.Null) return "NULL";
	}
	// boolean: PG parses DEFAULT true/false as TypeCast to bool
	if (node.TypeCast) {
		const typeNames = (node.TypeCast.typeName?.names ?? [])
			.map((n: AstNode) => n.String?.str)
			.filter(Boolean);
		if (typeNames.includes("bool")) {
			const str = node.TypeCast.arg?.A_Const?.val?.String?.str;
			return str === "t" ? "true" : "false";
		}
	}
	if (node.FuncCall) {
		const funcNames = (node.FuncCall.funcname ?? [])
			.map((n: AstNode) => n.String?.str)
			.filter(Boolean);
		return `${funcNames.join(".")}()`;
	}
	return "?";
}

function extractColumnDef(colDef: AstNode): {
	column: Column;
	relations: Relation[];
	isPkConstraint: boolean;
} {
	const constraints = colDef.constraints ?? [];
	let nullable = true;
	let defaultVal: string | null = null;
	let isPrimaryKey = false;
	let isPkConstraint = false;
	const relations: Relation[] = [];

	for (const c of constraints) {
		const constraint = c.Constraint;
		if (!constraint) continue;
		switch (constraint.contype) {
			case "CONSTR_NOTNULL":
				nullable = false;
				break;
			case "CONSTR_DEFAULT":
				if (constraint.raw_expr) {
					defaultVal = deparseExpr(constraint.raw_expr);
				}
				break;
			case "CONSTR_PRIMARY":
				isPrimaryKey = true;
				isPkConstraint = true;
				nullable = false;
				break;
			case "CONSTR_FOREIGN":
				relations.push({
					fromTable: "", // filled in by caller
					fromColumns: [colDef.colname],
					toTable: constraint.pktable.relname,
					toColumns: (constraint.pk_attrs ?? []).map((a: AstNode) => a.String.str),
					source: "fk",
				});
				break;
		}
	}

	return {
		column: {
			name: colDef.colname,
			type: resolveTypeName(colDef.typeName),
			nullable,
			default: defaultVal,
			comment: null,
			isPrimaryKey,
		},
		relations,
		isPkConstraint,
	};
}

export class DdlExtractor {
	async extract(sql: string): Promise<DdlExtractResult> {
		const ast = await parse(sql);
		return this.processStatements(ast.stmts);
	}

	async extractMultiple(sqls: string[]): Promise<DdlExtractResult> {
		const allStmts: AstNode[] = [];
		for (const sql of sqls) {
			const ast = await parse(sql);
			allStmts.push(...ast.stmts);
		}
		return this.processStatements(allStmts);
	}

	private processStatements(stmts: AstNode[]): DdlExtractResult {
		const tableMap = new Map<string, Table>();
		const relations: Relation[] = [];

		for (const stmtWrapper of stmts) {
			const stmt = stmtWrapper.stmt;

			if (stmt.CreateStmt) {
				const { table, rels } = this.processCreateStmt(stmt.CreateStmt);
				tableMap.set(table.name, table);
				relations.push(...rels);
			} else if (stmt.CommentStmt) {
				this.processCommentStmt(stmt.CommentStmt, tableMap);
			} else if (stmt.IndexStmt) {
				this.processIndexStmt(stmt.IndexStmt, tableMap);
			} else if (stmt.AlterTableStmt) {
				this.processAlterTableStmt(stmt.AlterTableStmt, tableMap, relations);
			}
		}

		return { tables: [...tableMap.values()], relations };
	}

	private processCreateStmt(createStmt: AstNode): { table: Table; rels: Relation[] } {
		const tableName = createStmt.relation.relname;
		const columns: Column[] = [];
		const relations: Relation[] = [];

		for (const elt of createStmt.tableElts ?? []) {
			if (elt.ColumnDef) {
				const { column, relations: colRels } = extractColumnDef(elt.ColumnDef);
				columns.push(column);
				for (const rel of colRels) {
					rel.fromTable = tableName;
				}
				relations.push(...colRels);
			} else if (elt.Constraint) {
				this.processTableConstraint(elt.Constraint, tableName, columns, relations);
			}
		}

		return {
			table: {
				name: tableName,
				columns,
				constraints: [],
				indexes: [],
				comment: null,
			},
			rels: relations,
		};
	}

	private processTableConstraint(
		constraint: AstNode,
		tableName: string,
		columns: Column[],
		relations: Relation[],
	): void {
		switch (constraint.contype) {
			case "CONSTR_PRIMARY": {
				const pkCols = (constraint.keys ?? []).map((k: AstNode) => k.String.str);
				for (const col of columns) {
					if (pkCols.includes(col.name)) {
						col.isPrimaryKey = true;
						col.nullable = false;
					}
				}
				break;
			}
			case "CONSTR_FOREIGN": {
				relations.push({
					fromTable: tableName,
					fromColumns: (constraint.fk_attrs ?? []).map((a: AstNode) => a.String.str),
					toTable: constraint.pktable.relname,
					toColumns: (constraint.pk_attrs ?? []).map((a: AstNode) => a.String.str),
					source: "fk",
				});
				break;
			}
		}
	}

	private processCommentStmt(commentStmt: AstNode, tableMap: Map<string, Table>): void {
		const items = commentStmt.object?.List?.items ?? [];
		const names = items.map((i: AstNode) => i.String?.str).filter(Boolean);

		if (commentStmt.objtype === "OBJECT_TABLE") {
			const tableName = names[names.length - 1];
			const table = tableMap.get(tableName);
			if (table) {
				table.comment = commentStmt.comment;
			}
		} else if (commentStmt.objtype === "OBJECT_COLUMN") {
			// names = [schema?, table, column]
			const columnName = names[names.length - 1];
			const tableName = names[names.length - 2];
			const table = tableMap.get(tableName);
			if (table) {
				const col = table.columns.find((c) => c.name === columnName);
				if (col) {
					col.comment = commentStmt.comment;
				}
			}
		}
	}

	private processIndexStmt(indexStmt: AstNode, tableMap: Map<string, Table>): void {
		const tableName = indexStmt.relation.relname;
		const table = tableMap.get(tableName);
		if (!table) return;

		const index: Index = {
			name: indexStmt.idxname,
			columns: (indexStmt.indexParams ?? []).map((p: AstNode) => p.IndexElem?.name).filter(Boolean),
			unique: indexStmt.unique ?? false,
		};
		table.indexes.push(index);
	}

	private processAlterTableStmt(
		alterStmt: AstNode,
		tableMap: Map<string, Table>,
		relations: Relation[],
	): void {
		const tableName = alterStmt.relation.relname;
		const table = tableMap.get(tableName);

		for (const cmd of alterStmt.cmds ?? []) {
			const alterCmd = cmd.AlterTableCmd;
			if (!alterCmd) continue;

			switch (alterCmd.subtype) {
				case "AT_AddConstraint": {
					const constraint = alterCmd.def?.Constraint;
					if (constraint?.contype === "CONSTR_FOREIGN") {
						relations.push({
							fromTable: tableName,
							fromColumns: (constraint.fk_attrs ?? []).map((a: AstNode) => a.String.str),
							toTable: constraint.pktable.relname,
							toColumns: (constraint.pk_attrs ?? []).map((a: AstNode) => a.String.str),
							source: "fk",
						});
					}
					break;
				}
				case "AT_AddColumn": {
					if (!table) break;
					const colDef = alterCmd.def?.ColumnDef;
					if (colDef) {
						const { column, relations: colRels } = extractColumnDef(colDef);
						table.columns.push(column);
						for (const rel of colRels) {
							rel.fromTable = tableName;
						}
						relations.push(...colRels);
					}
					break;
				}
			}
		}
	}
}
