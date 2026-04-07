import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SchemaRegistry } from "../../application/schema-registry.js";

export function createMcpServer(sqlDirs: string[]): McpServer {
	const registry = new SchemaRegistry(sqlDirs);

	const server = new McpServer({
		name: "db-schema-analyze",
		version: "0.1.0",
	});

	// --- list-tables ---
	server.tool("list-tables", "テーブル一覧を返す", async () => {
		const names = registry.getTableNames();
		return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
	});

	// --- describe-table ---
	server.tool(
		"describe-table",
		"指定テーブルの詳細(カラム、インデックス、コメント)を返す",
		{ table_name: z.string().describe("テーブル名") },
		async ({ table_name }) => {
			const table = await registry.getTable(table_name);
			if (!table) {
				return {
					isError: true as const,
					content: [{ type: "text" as const, text: `テーブル '${table_name}' が見つかりません` }],
				};
			}
			return { content: [{ type: "text", text: JSON.stringify(table, null, 2) }] };
		},
	);

	// --- list-relations ---
	server.tool(
		"list-relations",
		"指定テーブルのリレーション(FK確定 + 同名カラム推定)を返す",
		{ table_name: z.string().describe("テーブル名") },
		async ({ table_name }) => {
			const relations = await registry.getRelationsForTable(table_name);
			return { content: [{ type: "text", text: JSON.stringify(relations, null, 2) }] };
		},
	);

	// --- list-master-data ---
	server.tool(
		"list-master-data",
		"マスタデータの一覧、またはテーブル指定でマスタデータの中身を返す",
		{ table_name: z.string().optional().describe("テーブル名 (省略時は一覧を返す)") },
		async ({ table_name }) => {
			if (!table_name) {
				const tables = registry.getMasterDataTables();
				return { content: [{ type: "text", text: JSON.stringify(tables, null, 2) }] };
			}
			const data = await registry.getMasterDataForTable(table_name);
			if (!data) {
				return {
					content: [{ type: "text", text: `テーブル '${table_name}' のマスタデータはありません` }],
				};
			}
			return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
		},
	);

	// --- find-shared-columns ---
	server.tool(
		"find-shared-columns",
		"複数テーブルに存在する同名カラムを検出する (FK未定義のレガシースキーマで暗黙的な関連を発見)",
		{
			exclude_patterns: z
				.array(z.string())
				.optional()
				.describe("除外するカラム名パターン (例: ['id', 'created_at'])"),
		},
		async ({ exclude_patterns }) => {
			const shared = await registry.findSharedColumns({
				excludePatterns: exclude_patterns,
			});
			return { content: [{ type: "text", text: JSON.stringify(shared, null, 2) }] };
		},
	);

	return server;
}
