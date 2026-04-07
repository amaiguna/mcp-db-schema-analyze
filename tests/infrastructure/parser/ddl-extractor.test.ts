import { describe, expect, it } from "vitest";
import { DdlExtractor } from "../../../src/infrastructure/parser/ddl-extractor";

// ---------------------------------------------------------------------------
// DDL Extractor テスト
//
// 目的: 生のPostgreSQL DDL文字列をパースし、ドメインモデル (Table, Relation等) へ
//       正しく変換できることを検証する。
//       pgsql-parser の AST を経由するが、テストは「SQL入力 → ドメインモデル出力」の
//       ブラックボックステストとして書く。
// ---------------------------------------------------------------------------

describe("DdlExtractor", () => {
	const extractor = new DdlExtractor();

	// === CREATE TABLE ===

	describe("CREATE TABLE の基本パース", () => {
		it("テーブル名とカラム名・型を正しく抽出する", async () => {
			const sql = `
				CREATE TABLE users (
					id integer,
					name varchar(255),
					email text
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables).toHaveLength(1);
			expect(result.tables[0].name).toBe("users");
			expect(result.tables[0].columns).toHaveLength(3);
			expect(result.tables[0].columns[0]).toMatchObject({ name: "id", type: "integer" });
			expect(result.tables[0].columns[1]).toMatchObject({ name: "name", type: "varchar(255)" });
			expect(result.tables[0].columns[2]).toMatchObject({ name: "email", type: "text" });
		});

		it("NOT NULL 制約を nullable フラグに反映する", async () => {
			const sql = `
				CREATE TABLE users (
					id integer NOT NULL,
					name varchar(255)
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[0].nullable).toBe(false);
			// NOT NULL が付いていないカラムは nullable: true
			expect(result.tables[0].columns[1].nullable).toBe(true);
		});

		it("DEFAULT 値を抽出する", async () => {
			const sql = `
				CREATE TABLE orders (
					id integer,
					status varchar(50) DEFAULT 'pending',
					created_at timestamp DEFAULT now()
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[1].default).toBe("'pending'");
			expect(result.tables[0].columns[2].default).toBe("now()");
		});

		it("DEFAULT false / true (boolean) を正しく抽出する", async () => {
			const sql = `
				CREATE TABLE features (
					id integer,
					is_active boolean DEFAULT false,
					is_visible boolean DEFAULT true
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[1].default).toBe("false");
			expect(result.tables[0].columns[2].default).toBe("true");
		});

		it("ARRAY 型を正しく抽出する (text[], integer[])", async () => {
			const sql = `
				CREATE TABLE tags (
					id integer,
					labels text[],
					scores integer[]
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[1].type).toBe("text[]");
			expect(result.tables[0].columns[2].type).toBe("integer[]");
		});

		it("JSON, JSONB, UUID, BYTEA 等の型を正しく抽出する", async () => {
			const sql = `
				CREATE TABLE documents (
					id uuid,
					data jsonb,
					metadata json,
					content bytea
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[0].type).toBe("uuid");
			expect(result.tables[0].columns[1].type).toBe("jsonb");
			expect(result.tables[0].columns[2].type).toBe("json");
			expect(result.tables[0].columns[3].type).toBe("bytea");
		});

		it("SERIAL 系の型を正しく抽出する", async () => {
			const sql = `
				CREATE TABLE sequences (
					a serial,
					b bigserial,
					c smallserial
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[0].type).toBe("serial");
			expect(result.tables[0].columns[1].type).toBe("bigserial");
			expect(result.tables[0].columns[2].type).toBe("smallserial");
		});
	});

	// === PRIMARY KEY ===

	describe("PRIMARY KEY の抽出", () => {
		it("カラム定義内の PRIMARY KEY を認識する", async () => {
			const sql = `
				CREATE TABLE users (
					id serial PRIMARY KEY,
					name text
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[0].isPrimaryKey).toBe(true);
			expect(result.tables[0].columns[1].isPrimaryKey).toBe(false);
		});

		it("テーブル制約として定義された複合 PRIMARY KEY を認識する", async () => {
			const sql = `
				CREATE TABLE order_items (
					order_id integer,
					product_id integer,
					quantity integer,
					PRIMARY KEY (order_id, product_id)
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns[0].isPrimaryKey).toBe(true);
			expect(result.tables[0].columns[1].isPrimaryKey).toBe(true);
			expect(result.tables[0].columns[2].isPrimaryKey).toBe(false);
		});
	});

	// === FOREIGN KEY → Relation ===

	describe("FOREIGN KEY からリレーションを抽出する", () => {
		it("インライン REFERENCES からリレーションを抽出する", async () => {
			const sql = `
				CREATE TABLE orders (
					id serial PRIMARY KEY,
					user_id integer REFERENCES users(id)
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.relations).toHaveLength(1);
			expect(result.relations[0]).toMatchObject({
				fromTable: "orders",
				fromColumns: ["user_id"],
				toTable: "users",
				toColumns: ["id"],
			});
		});

		it("テーブル制約の FOREIGN KEY からリレーションを抽出する", async () => {
			const sql = `
				CREATE TABLE order_items (
					order_id integer,
					product_id integer,
					FOREIGN KEY (order_id) REFERENCES orders(id),
					FOREIGN KEY (product_id) REFERENCES products(id)
				);
			`;
			const result = await extractor.extract(sql);

			expect(result.relations).toHaveLength(2);
			expect(result.relations[0]).toMatchObject({
				fromTable: "order_items",
				fromColumns: ["order_id"],
				toTable: "orders",
			});
			expect(result.relations[1]).toMatchObject({
				fromTable: "order_items",
				fromColumns: ["product_id"],
				toTable: "products",
			});
		});
	});

	// === COMMENT ON ===

	describe("COMMENT ON によるコメント付与", () => {
		it("テーブルコメントを抽出する", async () => {
			const sql = `
				CREATE TABLE users (
					id integer
				);
				COMMENT ON TABLE users IS 'ユーザー管理テーブル';
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].comment).toBe("ユーザー管理テーブル");
		});

		it("カラムコメントを抽出する", async () => {
			const sql = `
				CREATE TABLE users (
					id integer,
					email text
				);
				COMMENT ON COLUMN users.email IS 'メールアドレス（一意）';
			`;
			const result = await extractor.extract(sql);

			const emailColumn = result.tables[0].columns.find((c) => c.name === "email");
			expect(emailColumn?.comment).toBe("メールアドレス（一意）");
		});
	});

	// === CREATE INDEX ===

	describe("CREATE INDEX の抽出", () => {
		it("テーブルに紐づくインデックスを抽出する", async () => {
			const sql = `
				CREATE TABLE users (
					id integer,
					email text
				);
				CREATE INDEX idx_users_email ON users (email);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].indexes).toHaveLength(1);
			expect(result.tables[0].indexes[0]).toMatchObject({
				name: "idx_users_email",
				columns: ["email"],
				unique: false,
			});
		});

		it("UNIQUE INDEX を認識する", async () => {
			const sql = `
				CREATE TABLE users (
					id integer,
					email text
				);
				CREATE UNIQUE INDEX idx_users_email_unique ON users (email);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].indexes[0].unique).toBe(true);
		});
	});

	// === ALTER TABLE ===

	describe("ALTER TABLE の処理", () => {
		it("ALTER TABLE ADD CONSTRAINT FOREIGN KEY からリレーションを抽出する", async () => {
			const sql = `
				CREATE TABLE orders (
					id serial PRIMARY KEY,
					user_id integer NOT NULL
				);
				ALTER TABLE orders ADD CONSTRAINT fk_orders_user_id
					FOREIGN KEY (user_id) REFERENCES users(id);
			`;
			const result = await extractor.extract(sql);

			expect(result.relations).toHaveLength(1);
			expect(result.relations[0]).toMatchObject({
				fromTable: "orders",
				fromColumns: ["user_id"],
				toTable: "users",
				toColumns: ["id"],
			});
		});

		it("ALTER TABLE ADD COLUMN で追加されたカラムをテーブルに反映する", async () => {
			const sql = `
				CREATE TABLE users (
					id serial PRIMARY KEY,
					name text NOT NULL
				);
				ALTER TABLE users ADD COLUMN phone varchar(20);
			`;
			const result = await extractor.extract(sql);

			expect(result.tables[0].columns).toHaveLength(3);
			const phone = result.tables[0].columns.find((c) => c.name === "phone");
			expect(phone).toBeDefined();
			expect(phone?.type).toBe("varchar(20)");
			// ADD COLUMN のカラムは明示的に NOT NULL がなければ nullable
			expect(phone?.nullable).toBe(true);
		});

		it("ALTER TABLE が別ファイル（extractMultiple）でも正しくテーブルに紐付く", async () => {
			const tableFile = `
				CREATE TABLE orders (
					id serial PRIMARY KEY,
					user_id integer NOT NULL
				);
			`;
			const alterFile = `
				ALTER TABLE orders ADD CONSTRAINT fk_orders_user_id
					FOREIGN KEY (user_id) REFERENCES users(id);
				ALTER TABLE orders ADD COLUMN note text;
			`;

			const result = await extractor.extractMultiple([tableFile, alterFile]);

			expect(result.tables).toHaveLength(1);
			// FK が抽出される
			expect(result.relations).toHaveLength(1);
			expect(result.relations[0].fromTable).toBe("orders");
			// ADD COLUMN が反映される
			const note = result.tables[0].columns.find((c) => c.name === "note");
			expect(note).toBeDefined();
		});
	});

	// === 複数ファイル想定: 別々のSQL文字列を結合して処理 ===

	describe("複数SQL文の結合処理", () => {
		it("CREATE TABLE と後からの COMMENT ON / CREATE INDEX を正しく紐付ける", async () => {
			// 実際の運用では、テーブル定義とインデックスが別ファイルにあるケース
			const ddlFile1 = `
				CREATE TABLE products (
					id serial PRIMARY KEY,
					name text NOT NULL,
					price numeric(10,2)
				);
			`;
			const ddlFile2 = `
				COMMENT ON TABLE products IS '商品マスタ';
				COMMENT ON COLUMN products.name IS '商品名';
				CREATE INDEX idx_products_name ON products (name);
			`;

			// extractMultiple: 複数のSQL文字列を受け取り、統合して返す
			const result = await extractor.extractMultiple([ddlFile1, ddlFile2]);

			expect(result.tables).toHaveLength(1);
			expect(result.tables[0].comment).toBe("商品マスタ");
			expect(result.tables[0].columns.find((c) => c.name === "name")?.comment).toBe("商品名");
			expect(result.tables[0].indexes).toHaveLength(1);
		});
	});

	// === スキーマ修飾 ===

	describe("スキーマ修飾されたテーブル名", () => {
		it("public.users のようなスキーマ修飾を正しくハンドリングする", async () => {
			const sql = `
				CREATE TABLE public.users (
					id integer PRIMARY KEY
				);
				COMMENT ON TABLE public.users IS 'ユーザー';
			`;
			const result = await extractor.extract(sql);

			// テーブル名は "users" として扱う（スキーマ名は分離して保持 or 省略）
			expect(result.tables[0].name).toBe("users");
			expect(result.tables[0].comment).toBe("ユーザー");
		});
	});
});
