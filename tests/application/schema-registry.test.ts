import { describe, expect, it } from "vitest";
import { SchemaRegistry } from "../../src/application/schema-registry";

// ---------------------------------------------------------------------------
// SchemaRegistry テスト
//
// 目的: prepare済み (テーブル単位1ファイル) のディレクトリを対象に、
//       遅延ロード + キャッシュが正しく機能することを検証する。
//
// フィクスチャ構成 (tests/fixtures/):
//   ddl/users.sql    -- CREATE TABLE + COMMENT ON + CREATE INDEX
//   ddl/orders.sql   -- CREATE TABLE + COMMENT ON + CREATE INDEX
//   ddl/roles.sql    -- CREATE TABLE + COMMENT ON
//   dml/roles.sql    -- INSERT INTO roles
// ---------------------------------------------------------------------------

const DDL_DIR = new URL("../fixtures/ddl", import.meta.url).pathname;
const DML_DIR = new URL("../fixtures/dml", import.meta.url).pathname;

describe("SchemaRegistry", () => {
	// === 起動時: ファイルスキャンのみでパースしない ===

	describe("初期化 - ディレクトリスキャン", () => {
		it("DDL/DMLディレクトリをスキャンしてテーブル名一覧を取得できる", () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			// パースせずファイル名からテーブル名を即座に返す
			const names = registry.getTableNames();
			expect(names).toContain("users");
			expect(names).toContain("orders");
			expect(names).toContain("roles");
		});

		it("マスタデータを持つテーブル名一覧をファイル名から取得できる", () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const names = registry.getMasterDataTables();
			expect(names).toEqual(["roles"]);
		});

		it("存在しないディレクトリを指定するとエラーになる", () => {
			expect(() => new SchemaRegistry(["/nonexistent"])).toThrow();
		});
	});

	// === 単テーブル操作: 必要な1ファイルだけパースする ===

	describe("getTable - 単テーブルの遅延ロード", () => {
		it("指定テーブルのDDLだけをパースして返す", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const table = await registry.getTable("users");
			expect(table).toBeDefined();
			expect(table?.name).toBe("users");
			expect(table?.columns.length).toBeGreaterThan(0);
			expect(table?.comment).toBe("ユーザー管理テーブル");
		});

		it("2回目の呼び出しはキャッシュから返す (再パースしない)", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const first = await registry.getTable("users");
			const second = await registry.getTable("users");
			// 同一オブジェクト参照ならキャッシュから返している
			expect(first).toBe(second);
		});

		it("存在しないテーブル名を指定すると undefined を返す", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const result = await registry.getTable("nonexistent");
			expect(result).toBeUndefined();
		});
	});

	describe("getMasterDataForTable - 単テーブルのマスタデータ遅延ロード", () => {
		it("指定テーブルのDMLだけをパースして返す", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const data = await registry.getMasterDataForTable("roles");
			expect(data).toBeDefined();
			expect(data?.table).toBe("roles");
			expect(data?.rows.length).toBeGreaterThan(0);
		});

		it("マスタデータが存在しないテーブルは undefined を返す", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const data = await registry.getMasterDataForTable("users");
			expect(data).toBeUndefined();
		});
	});

	// === 横断操作: 初回のみ全テーブルをパース ===

	describe("getRelationsForTable - 横断操作 (全テーブル遅延パース)", () => {
		it("FK制約からリレーションを抽出して返す", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			// orders.user_id → users.id のリレーションがあるはず
			const relations = await registry.getRelationsForTable("orders");
			expect(relations.some((r) => r.toTable === "users")).toBe(true);
		});

		it("FK先テーブルからも関連リレーションを取得できる", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			// users は orders→users と users→roles の2つに関与
			const relations = await registry.getRelationsForTable("users");
			expect(relations.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("findSharedColumns - 横断操作 (全テーブル遅延パース)", () => {
		it("複数テーブルに存在する同名カラムを返す", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const shared = await registry.findSharedColumns();
			// users.id, orders.id, roles.id は全テーブルに存在
			expect(shared.some((sc) => sc.columnName === "id")).toBe(true);
		});

		it("excludePatterns でノイズを除外できる", async () => {
			const registry = new SchemaRegistry([DDL_DIR, DML_DIR]);

			const shared = await registry.findSharedColumns({
				excludePatterns: ["id"],
			});
			expect(shared.some((sc) => sc.columnName === "id")).toBe(false);
		});
	});

	// === DDLのみ指定 (DMLなし) でも動作する ===

	describe("DDLのみ指定", () => {
		it("DMLディレクトリなしでもテーブル情報は取得できる", async () => {
			const registry = new SchemaRegistry([DDL_DIR]);

			const table = await registry.getTable("users");
			expect(table).toBeDefined();
			expect(registry.getMasterDataTables()).toEqual([]);
		});
	});
});
