import * as fs from "node:fs";
import * as path from "node:path";
import { deparse, parse } from "pgsql-parser";
import type { TableMeta } from "../domain/model/types.js";
import { readSqlFiles } from "../infrastructure/file/sql-file-reader.js";
import { writeSqlFile } from "../infrastructure/file/sql-file-writer.js";

export interface PrepareSqlOptions {
	inputDirs: string[];
	outputDir: string;
}

// biome-ignore lint/suspicious/noExplicitAny: pgsql-parser AST is untyped
type AstNode = any;

type StmtCategory = "ddl" | "dml" | "sequence" | "function";

/**
 * ステートメントのカテゴリと名前を特定する。
 */
function classifyStmt(stmt: AstNode): { category: StmtCategory; name: string } | null {
	if (stmt.CreateSeqStmt) {
		return { category: "sequence", name: stmt.CreateSeqStmt.sequence.relname };
	}
	if (stmt.CreateFunctionStmt) {
		const funcNames = (stmt.CreateFunctionStmt.funcname ?? [])
			.map((n: AstNode) => n.String?.str)
			.filter(Boolean);
		const name = funcNames[funcNames.length - 1];
		return name ? { category: "function", name } : null;
	}
	if (stmt.InsertStmt) {
		return { category: "dml", name: stmt.InsertStmt.relation.relname };
	}
	// テーブル関連のDDL
	const tableName = getTableName(stmt);
	if (tableName) {
		return { category: "ddl", name: tableName };
	}
	return null;
}

/**
 * テーブル関連ステートメントのテーブル名を特定する。
 */
function getTableName(stmt: AstNode): string | null {
	if (stmt.CreateStmt) return stmt.CreateStmt.relation.relname;
	if (stmt.IndexStmt) return stmt.IndexStmt.relation.relname;
	if (stmt.AlterTableStmt) return stmt.AlterTableStmt.relation.relname;
	if (stmt.CommentStmt) {
		const items = stmt.CommentStmt.object?.List?.items ?? [];
		const names = items.map((i: AstNode) => i.String?.str).filter(Boolean);
		if (stmt.CommentStmt.objtype === "OBJECT_TABLE") {
			return names[names.length - 1] ?? null;
		}
		if (stmt.CommentStmt.objtype === "OBJECT_COLUMN") {
			return names.length >= 2 ? names[names.length - 2] : null;
		}
	}
	return null;
}

const CATEGORY_DIRS: Record<StmtCategory, string> = {
	ddl: "ddl",
	dml: "dml",
	sequence: "sequences",
	function: "functions",
};

export async function prepareSql(options: PrepareSqlOptions): Promise<void> {
	const sqlContents = await readSqlFiles(options.inputDirs);

	// 全SQL文をパースしてステートメント単位に分解 (空ファイルはスキップ)
	const allStmts: AstNode[] = [];
	let version = 0;
	for (const sql of sqlContents) {
		const trimmed = sql.trim();
		if (trimmed === "" || (trimmed.startsWith("--") && !trimmed.includes("\n"))) continue;
		try {
			const ast = await parse(trimmed);
			version = ast.version;
			allStmts.push(...ast.stmts);
		} catch {
			// パースできないファイルはスキップ (コメントのみ等)
		}
	}

	// カテゴリ × 名前 で振り分け
	const buckets = new Map<StmtCategory, Map<string, AstNode[]>>();
	for (const category of Object.keys(CATEGORY_DIRS) as StmtCategory[]) {
		buckets.set(category, new Map());
	}

	for (const stmtWrapper of allStmts) {
		const classified = classifyStmt(stmtWrapper.stmt);
		if (!classified) continue;

		const bucket = buckets.get(classified.category);
		if (!bucket) continue;
		const stmts = bucket.get(classified.name) ?? [];
		stmts.push(stmtWrapper);
		bucket.set(classified.name, stmts);
	}

	// テーブルコメントを収集
	const tableComments = new Map<string, string>();
	for (const stmtWrapper of allStmts) {
		const stmt = stmtWrapper.stmt;
		if (stmt.CommentStmt?.objtype === "OBJECT_TABLE") {
			const items = stmt.CommentStmt.object?.List?.items ?? [];
			const names = items.map((i: AstNode) => i.String?.str).filter(Boolean);
			const tableName = names[names.length - 1];
			if (tableName && stmt.CommentStmt.comment) {
				tableComments.set(tableName, stmt.CommentStmt.comment);
			}
		}
	}

	// 各カテゴリを書き出し
	for (const [category, nameMap] of buckets) {
		const dir = `${options.outputDir}/${CATEGORY_DIRS[category]}`;
		for (const [name, stmts] of nameMap) {
			const sql = await deparse({ version, stmts });
			writeSqlFile(dir, `${name}.sql`, `${sql.trim()}\n`);
		}
	}

	// meta.json を出力 (テーブル名→コメントのマッピング)
	const ddlBucket = buckets.get("ddl");
	if (ddlBucket) {
		const meta: TableMeta = { tables: {} };
		for (const name of ddlBucket.keys()) {
			meta.tables[name] = { comment: tableComments.get(name) ?? null };
		}
		fs.mkdirSync(options.outputDir, { recursive: true });
		fs.writeFileSync(
			path.join(options.outputDir, "meta.json"),
			`${JSON.stringify(meta, null, 2)}\n`,
			"utf-8",
		);
	}
}
