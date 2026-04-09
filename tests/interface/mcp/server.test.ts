import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMcpServer } from "../../../src/interface/mcp/server";

// ---------------------------------------------------------------------------
// MCPサーバー統合テスト
//
// 目的: MCPプロトコル経由で各ツールが正しくレスポンスを返すことを検証する。
//       InMemoryTransport でClient/Serverを直結し、実際のツール呼び出しをテスト。
//       フィクスチャは prepare済みの ddl/ + dml/ を使う。
// ---------------------------------------------------------------------------

const DDL_DIR = new URL("../../fixtures/ddl", import.meta.url).pathname;
const DML_DIR = new URL("../../fixtures/dml", import.meta.url).pathname;
const SEQ_DIR = new URL("../../fixtures/sequences", import.meta.url).pathname;
const FUNC_DIR = new URL("../../fixtures/functions", import.meta.url).pathname;

let client: Client;
let cleanup: () => Promise<void>;

beforeAll(async () => {
	const server = createMcpServer([DDL_DIR, DML_DIR, SEQ_DIR, FUNC_DIR]);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

	client = new Client({ name: "test-client", version: "0.0.1" });
	await server.connect(serverTransport);
	await client.connect(clientTransport);

	cleanup = async () => {
		await client.close();
		await server.close();
	};
});

afterAll(async () => {
	await cleanup();
});

// === list-tables ===

describe("list-tables ツール", () => {
	it("テーブル名の一覧を返す", async () => {
		const result = await client.callTool({ name: "list-tables", arguments: {} });

		// result.content はテキストコンテンツの配列
		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		expect(text).toContain("users");
		expect(text).toContain("orders");
		expect(text).toContain("roles");
	});
});

// === describe-table ===

describe("describe-table ツール", () => {
	it("指定テーブルのカラム情報を返す", async () => {
		const result = await client.callTool({
			name: "describe-table",
			arguments: { table_name: "users" },
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		// カラム名が含まれる
		expect(text).toContain("id");
		expect(text).toContain("name");
		expect(text).toContain("email");
		// コメントが含まれる
		expect(text).toContain("ユーザー管理テーブル");
	});

	it("存在しないテーブルを指定するとエラーメッセージを返す", async () => {
		const result = await client.callTool({
			name: "describe-table",
			arguments: { table_name: "nonexistent" },
		});

		expect(result.isError).toBe(true);
	});
});

// === list-relations ===

describe("list-relations ツール", () => {
	it("指定テーブルのリレーションを返す", async () => {
		const result = await client.callTool({
			name: "list-relations",
			arguments: { table_name: "orders" },
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		// orders → users のリレーションが含まれる
		expect(text).toContain("users");
	});
});

// === list-master-data ===

describe("list-master-data ツール", () => {
	it("引数なしでマスタデータを持つテーブル一覧を返す", async () => {
		const result = await client.callTool({
			name: "list-master-data",
			arguments: {},
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		expect(text).toContain("roles");
	});

	it("テーブル名を指定するとマスタデータの中身を返す", async () => {
		const result = await client.callTool({
			name: "list-master-data",
			arguments: { table_name: "roles" },
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		expect(text).toContain("admin");
		expect(text).toContain("member");
	});
});

// === find-shared-columns ===

describe("find-shared-columns ツール", () => {
	it("複数テーブルに存在する同名カラムを返す", async () => {
		const result = await client.callTool({
			name: "find-shared-columns",
			arguments: {},
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		// id は全テーブルに存在
		expect(text).toContain("id");
	});

	it("exclude_patterns で除外できる", async () => {
		const result = await client.callTool({
			name: "find-shared-columns",
			arguments: { exclude_patterns: ["id", "name"] },
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		// "id" がカラム名として含まれないことを確認 (テーブル名に含まれる可能性があるのでパース結果で判断)
		// find-shared-columns の結果は構造化されるので、id がキーとして出ないことを確認
		expect(text).not.toMatch(/\bid\b.*:.*\[/);
	});
});

// === list-sequences ===

describe("list-sequences ツール", () => {
	it("シーケンス名の一覧を返す", async () => {
		const result = await client.callTool({
			name: "list-sequences",
			arguments: {},
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		expect(text).toContain("users_id_seq");
	});
});

// === describe-sequence ===

describe("describe-sequence ツール", () => {
	it("指定シーケンスの定義を返す", async () => {
		const result = await client.callTool({
			name: "describe-sequence",
			arguments: { sequence_name: "users_id_seq" },
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		expect(text).toContain("users_id_seq");
	});
});

// === list-functions ===

describe("list-functions ツール", () => {
	it("関数名の一覧を返す", async () => {
		const result = await client.callTool({
			name: "list-functions",
			arguments: {},
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		expect(text).toContain("get_user_count");
	});
});

// === describe-function ===

describe("describe-function ツール", () => {
	it("指定関数の定義を返す", async () => {
		const result = await client.callTool({
			name: "describe-function",
			arguments: { function_name: "get_user_count" },
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		expect(text).toContain("get_user_count");
	});
});

// === get-table-meta ===

describe("get-table-meta ツール", () => {
	it("テーブル名とコメントのマッピングを返す", async () => {
		const result = await client.callTool({
			name: "get-table-meta",
			arguments: {},
		});

		const text = (result.content as Array<{ type: string; text: string }>)[0].text;
		const meta = JSON.parse(text);
		expect(meta.tables.users.comment).toBe("ユーザー管理テーブル");
		expect(meta.tables.orders.comment).toBe("注文テーブル");
		expect(meta.tables.roles.comment).toBe("ロールマスタ");
	});
});
