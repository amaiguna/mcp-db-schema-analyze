import { deparse, parse } from "pgsql-parser";
import { readSqlFiles } from "../infrastructure/file/sql-file-reader.js";
import { writeSqlFile } from "../infrastructure/file/sql-file-writer.js";

export interface PrepareSqlOptions {
	inputDirs: string[];
	outputDir: string;
}

// biome-ignore lint/suspicious/noExplicitAny: pgsql-parser AST is untyped
type AstNode = any;

/**
 * ステートメントが属するテーブル名を特定する。
 * 特定できない場合は null。
 */
function getTableName(stmt: AstNode): string | null {
	if (stmt.CreateStmt) return stmt.CreateStmt.relation.relname;
	if (stmt.IndexStmt) return stmt.IndexStmt.relation.relname;
	if (stmt.InsertStmt) return stmt.InsertStmt.relation.relname;
	if (stmt.AlterTableStmt) return stmt.AlterTableStmt.relation.relname;
	if (stmt.CommentStmt) {
		const items = stmt.CommentStmt.object?.List?.items ?? [];
		const names = items.map((i: AstNode) => i.String?.str).filter(Boolean);
		if (stmt.CommentStmt.objtype === "OBJECT_TABLE") {
			return names[names.length - 1] ?? null;
		}
		if (stmt.CommentStmt.objtype === "OBJECT_COLUMN") {
			// [schema?, table, column] → table is second-to-last
			return names.length >= 2 ? names[names.length - 2] : null;
		}
	}
	return null;
}

/**
 * ステートメントが DDL か DML かを判定する。
 */
function isDml(stmt: AstNode): boolean {
	return !!stmt.InsertStmt;
}

export async function prepareSql(options: PrepareSqlOptions): Promise<void> {
	const sqlContents = await readSqlFiles(options.inputDirs);

	// 全SQL文をパースしてステートメント単位に分解
	const allStmts: AstNode[] = [];
	let version = 0;
	for (const sql of sqlContents) {
		const ast = await parse(sql);
		version = ast.version;
		allStmts.push(...ast.stmts);
	}

	// テーブル単位 × DDL/DML に振り分け
	const ddlByTable = new Map<string, AstNode[]>();
	const dmlByTable = new Map<string, AstNode[]>();

	for (const stmtWrapper of allStmts) {
		const tableName = getTableName(stmtWrapper.stmt);
		if (!tableName) continue;

		const target = isDml(stmtWrapper.stmt) ? dmlByTable : ddlByTable;
		const stmts = target.get(tableName) ?? [];
		stmts.push(stmtWrapper);
		target.set(tableName, stmts);
	}

	// DDL を書き出し
	for (const [tableName, stmts] of ddlByTable) {
		const sql = await deparse({ version, stmts });
		writeSqlFile(`${options.outputDir}/ddl`, `${tableName}.sql`, `${sql.trim()}\n`);
	}

	// DML を書き出し
	for (const [tableName, stmts] of dmlByTable) {
		const sql = await deparse({ version, stmts });
		writeSqlFile(`${options.outputDir}/dml`, `${tableName}.sql`, `${sql.trim()}\n`);
	}
}
