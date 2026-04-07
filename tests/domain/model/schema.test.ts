import { describe, expect, it } from "vitest";
import { Schema } from "../../../src/domain/model/schema";
import type { Column, Index, MasterData, Relation, Table } from "../../../src/domain/model/types";

// ---------------------------------------------------------------------------
// ヘルパー: テスト用のドメインモデルを簡潔に組み立てる
// ---------------------------------------------------------------------------

function column(name: string, type: string, overrides?: Partial<Column>): Column {
	return {
		name,
		type,
		nullable: false,
		default: null,
		comment: null,
		isPrimaryKey: false,
		...overrides,
	};
}

function table(name: string, columns: Column[], overrides?: Partial<Table>): Table {
	return {
		name,
		columns,
		constraints: [],
		indexes: [],
		comment: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テスト用フィクスチャ: 典型的なEC系スキーマ
// ---------------------------------------------------------------------------

const usersTable = table(
	"users",
	[
		column("id", "integer", { isPrimaryKey: true }),
		column("name", "varchar(255)"),
		column("email", "varchar(255)"),
		column("role_id", "integer"),
	],
	{ comment: "ユーザー管理テーブル" },
);

const ordersTable = table("orders", [
	column("id", "integer", { isPrimaryKey: true }),
	column("user_id", "integer"),
	column("total", "numeric(10,2)"),
	column("status", "varchar(50)"),
]);

const rolesTable = table("roles", [
	column("id", "integer", { isPrimaryKey: true }),
	column("name", "varchar(100)"),
]);

const relations: Relation[] = [
	{
		fromTable: "orders",
		fromColumns: ["user_id"],
		toTable: "users",
		toColumns: ["id"],
		source: "fk",
	},
	{
		fromTable: "users",
		fromColumns: ["role_id"],
		toTable: "roles",
		toColumns: ["id"],
		source: "fk",
	},
];

const masterData: MasterData[] = [
	{
		table: "roles",
		columns: ["id", "name"],
		rows: [
			{ id: 1, name: "admin" },
			{ id: 2, name: "member" },
		],
	},
];

// ---------------------------------------------------------------------------
// Schema 集約ルートのテスト
// ---------------------------------------------------------------------------

describe("Schema", () => {
	const schema = new Schema([usersTable, ordersTable, rolesTable], relations, masterData);

	// --- テーブル一覧 ---

	describe("getTableNames - 保持しているテーブル名の一覧を返す", () => {
		it("全テーブル名をアルファベット順で返す", () => {
			expect(schema.getTableNames()).toEqual(["orders", "roles", "users"]);
		});
	});

	// --- テーブル詳細 ---

	describe("getTable - テーブル名を指定して詳細を取得する", () => {
		it("存在するテーブルの定義を返す", () => {
			const result = schema.getTable("users");
			expect(result).toBeDefined();
			expect(result?.name).toBe("users");
			expect(result?.columns).toHaveLength(4);
			expect(result?.comment).toBe("ユーザー管理テーブル");
		});

		it("存在しないテーブル名を指定すると undefined を返す", () => {
			expect(schema.getTable("nonexistent")).toBeUndefined();
		});
	});

	// --- リレーション ---

	describe("getRelationsForTable - 指定テーブルが関与するリレーションを返す", () => {
		it("FK元 (orders.user_id → users.id) として関与するリレーションを返す", () => {
			const result = schema.getRelationsForTable("orders");
			expect(result).toHaveLength(1);
			expect(result[0].toTable).toBe("users");
		});

		it("FK先 (users は orders, roles 両方と関連) としても返す", () => {
			const result = schema.getRelationsForTable("users");
			// users は orders→users と users→roles の2つに関与
			expect(result).toHaveLength(2);
		});

		it("リレーションのないテーブルは空配列を返す", () => {
			// roles は FK先としてのみ存在するが、users→roles で含まれるはず
			// 完全に孤立したテーブルを追加してテスト
			const isolated = new Schema([table("isolated", [column("id", "integer")])], [], []);
			expect(isolated.getRelationsForTable("isolated")).toEqual([]);
		});
	});

	// --- マスタデータ ---

	describe("getMasterData - マスタデータを参照する", () => {
		it("テーブル名を指定してマスタデータを取得できる", () => {
			const result = schema.getMasterDataForTable("roles");
			expect(result).toBeDefined();
			expect(result?.rows).toHaveLength(2);
			expect(result?.rows[0]).toEqual({ id: 1, name: "admin" });
		});

		it("マスタデータが存在しないテーブルは undefined を返す", () => {
			expect(schema.getMasterDataForTable("orders")).toBeUndefined();
		});
	});

	describe("getMasterDataTables - マスタデータを持つテーブルの一覧を返す", () => {
		it("マスタデータが登録されているテーブル名をリストで返す", () => {
			expect(schema.getMasterDataTables()).toEqual(["roles"]);
		});
	});

	// --- 同名カラム推定 (レガシースキーマ向け) ---

	describe("findSharedColumns - テーブル間で同名のカラムを検出する", () => {
		// FK制約がないレガシースキーマで、同名カラムから暗黙的なリレーションを推定するための機能
		// 例: events.event_id と event_logs.event_id が同名 → 関連がありそう

		const eventsTable = table("events", [
			column("id", "integer", { isPrimaryKey: true }),
			column("event_id", "varchar(50)"),
			column("name", "text"),
			column("created_at", "timestamp"),
		]);

		const eventLogsTable = table("event_logs", [
			column("id", "integer", { isPrimaryKey: true }),
			column("event_id", "varchar(50)"),
			column("log_message", "text"),
			column("created_at", "timestamp"),
		]);

		const eventMembersTable = table("event_members", [
			column("id", "integer", { isPrimaryKey: true }),
			column("event_id", "varchar(50)"),
			column("user_id", "integer"),
		]);

		const legacySchema = new Schema(
			[eventsTable, eventLogsTable, eventMembersTable],
			[], // FK制約なし
			[],
		);

		it("指定カラム名を持つテーブルの一覧を返す", () => {
			const result = legacySchema.findTablesByColumnName("event_id");

			expect(result).toHaveLength(3);
			expect(result.map((t) => t.name).sort()).toEqual(["event_logs", "event_members", "events"]);
		});

		it("2つ以上のテーブルに存在するカラム名を一覧で返す", () => {
			// id, created_at, event_id は複数テーブルに存在する
			const result = legacySchema.findSharedColumns();

			// id は PK なのでどのテーブルにもある（除外したいケースもあるが、まず全部返す）
			expect(result.some((sc) => sc.columnName === "event_id")).toBe(true);
			expect(result.some((sc) => sc.columnName === "created_at")).toBe(true);

			const eventIdEntry = result.find((sc) => sc.columnName === "event_id");
			expect(eventIdEntry?.tables.sort()).toEqual(["event_logs", "event_members", "events"]);
		});

		it("1テーブルにしか存在しないカラムは含まれない", () => {
			const result = legacySchema.findSharedColumns();

			// log_message は event_logs にしかない
			expect(result.some((sc) => sc.columnName === "log_message")).toBe(false);
			// user_id は event_members にしかない
			expect(result.some((sc) => sc.columnName === "user_id")).toBe(false);
		});

		it("PKやタイムスタンプ系を除外してビジネスキーだけ返すオプション", () => {
			// id, created_at, updated_at などはほぼ全テーブルに存在するため
			// ノイズになる。除外オプションで絞り込める
			const result = legacySchema.findSharedColumns({
				excludePatterns: ["id", "created_at", "updated_at"],
			});

			expect(result.some((sc) => sc.columnName === "event_id")).toBe(true);
			expect(result.some((sc) => sc.columnName === "id")).toBe(false);
			expect(result.some((sc) => sc.columnName === "created_at")).toBe(false);
		});
	});
});
