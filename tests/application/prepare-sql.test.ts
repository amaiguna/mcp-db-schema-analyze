import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareSql } from "../../src/application/prepare-sql";

// ---------------------------------------------------------------------------
// prepareSql ユースケーステスト
//
// 目的: バラバラなSQLファイル群を「DDL/DMLに分類 → テーブル単位に正規化」
//       して出力する前処理CLIのロジックを検証する。
//       実際にファイルを書き出して、出力結果のディレクトリ構造と中身を確認する。
// ---------------------------------------------------------------------------

const FIXTURES_DIR = new URL("../fixtures", import.meta.url).pathname;
const OUTPUT_DIR = new URL("../fixtures/.tmp-prepare-output", import.meta.url).pathname;

describe("prepareSql - SQLファイルを正規化して出力する", () => {
	beforeEach(() => {
		// 出力先を毎回クリーンにする
		fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
	});

	afterEach(() => {
		fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
	});

	it("DDLとDMLを自動分類して別ディレクトリに出力する", async () => {
		// fixtures/mixed/ にDDLとDMLが混在したSQLファイルを配置
		await prepareSql({
			inputDirs: [`${FIXTURES_DIR}/mixed`],
			outputDir: OUTPUT_DIR,
		});

		// ddl/ と dml/ が作られる
		expect(fs.existsSync(path.join(OUTPUT_DIR, "ddl"))).toBe(true);
		expect(fs.existsSync(path.join(OUTPUT_DIR, "dml"))).toBe(true);
	});

	it("DDLをテーブル単位のファイルに分割する", async () => {
		await prepareSql({
			inputDirs: [`${FIXTURES_DIR}/mixed`],
			outputDir: OUTPUT_DIR,
		});

		const ddlDir = path.join(OUTPUT_DIR, "ddl");
		const files = fs.readdirSync(ddlDir);

		// テーブルごとに1ファイル (users.sql, orders.sql 等)
		expect(files.some((f) => f === "users.sql")).toBe(true);
		expect(files.some((f) => f === "orders.sql")).toBe(true);
	});

	it("テーブルのDDLファイルに関連するCOMMENT ON, INDEX も含める", async () => {
		await prepareSql({
			inputDirs: [`${FIXTURES_DIR}/mixed`],
			outputDir: OUTPUT_DIR,
		});

		const usersSql = fs.readFileSync(path.join(OUTPUT_DIR, "ddl", "users.sql"), "utf-8");

		// CREATE TABLE, COMMENT ON, CREATE INDEX がすべて1ファイルにまとまっている
		expect(usersSql).toContain("CREATE TABLE");
		expect(usersSql).toContain("COMMENT ON");
	});

	it("DMLをテーブル単位のファイルに分割する", async () => {
		await prepareSql({
			inputDirs: [`${FIXTURES_DIR}/mixed`],
			outputDir: OUTPUT_DIR,
		});

		const dmlDir = path.join(OUTPUT_DIR, "dml");
		const files = fs.readdirSync(dmlDir);

		expect(files.some((f) => f === "roles.sql")).toBe(true);
	});

	it("入力ディレクトリが存在しない場合エラーになる", async () => {
		await expect(
			prepareSql({ inputDirs: ["/nonexistent"], outputDir: OUTPUT_DIR }),
		).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// 複数ファイルに分散したDDLの前処理テスト
//
// 実運用で最もありがちなケース:
//   - tables.sql     : CREATE TABLE のみ
//   - indexes.sql    : CREATE INDEX のみ
//   - alter_tables.sql: ALTER TABLE (FK追加, カラム追加)
//   - comments.sql   : COMMENT ON のみ
//   - master_data.sql: INSERT (DML)
// これらを prepare で正規化すると、テーブル単位の ddl/ と dml/ に集約される
// ---------------------------------------------------------------------------

describe("prepareSql - 複数ファイルに分散したDDLの統合", () => {
	beforeEach(() => {
		fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
	});

	afterEach(() => {
		fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
	});

	const MULTI_FILE_DIR = `${FIXTURES_DIR}/multi-file`;

	it("別ファイルの CREATE INDEX を対応するテーブルのDDLに統合する", async () => {
		await prepareSql({
			inputDirs: [MULTI_FILE_DIR],
			outputDir: OUTPUT_DIR,
		});

		const usersSql = fs.readFileSync(path.join(OUTPUT_DIR, "ddl", "users.sql"), "utf-8");

		// tables.sql の CREATE TABLE と indexes.sql の CREATE INDEX が1ファイルにまとまる
		expect(usersSql).toContain("CREATE TABLE");
		expect(usersSql).toContain("idx_users_email");
	});

	it("別ファイルの ALTER TABLE (FK制約) を対応するテーブルのDDLに統合する", async () => {
		await prepareSql({
			inputDirs: [MULTI_FILE_DIR],
			outputDir: OUTPUT_DIR,
		});

		const ordersSql = fs.readFileSync(path.join(OUTPUT_DIR, "ddl", "orders.sql"), "utf-8");

		// tables.sql の CREATE TABLE と alter_tables.sql の ALTER TABLE ADD CONSTRAINT が統合
		expect(ordersSql).toContain("CREATE TABLE");
		expect(ordersSql).toContain("fk_orders_user_id");
	});

	it("ALTER TABLE ADD COLUMN を対応するテーブルのDDLに統合する", async () => {
		await prepareSql({
			inputDirs: [MULTI_FILE_DIR],
			outputDir: OUTPUT_DIR,
		});

		const usersSql = fs.readFileSync(path.join(OUTPUT_DIR, "ddl", "users.sql"), "utf-8");

		// alter_tables.sql の ALTER TABLE users ADD COLUMN phone が統合される
		expect(usersSql).toContain("phone");
	});

	it("別ファイルの COMMENT ON を対応するテーブルのDDLに統合する", async () => {
		await prepareSql({
			inputDirs: [MULTI_FILE_DIR],
			outputDir: OUTPUT_DIR,
		});

		const ordersSql = fs.readFileSync(path.join(OUTPUT_DIR, "ddl", "orders.sql"), "utf-8");

		// comments.sql の COMMENT ON TABLE orders が統合される
		expect(ordersSql).toContain("COMMENT ON");
		expect(ordersSql).toContain("注文テーブル");
	});

	it("すべてのテーブルが個別ファイルとして出力される", async () => {
		await prepareSql({
			inputDirs: [MULTI_FILE_DIR],
			outputDir: OUTPUT_DIR,
		});

		const ddlFiles = fs.readdirSync(path.join(OUTPUT_DIR, "ddl")).sort();

		// tables.sql に定義された3テーブルがそれぞれファイルになる
		expect(ddlFiles).toContain("users.sql");
		expect(ddlFiles).toContain("orders.sql");
		expect(ddlFiles).toContain("order_items.sql");
	});

	it("DMLはテーブル単位に分割して dml/ に出力される", async () => {
		await prepareSql({
			inputDirs: [MULTI_FILE_DIR],
			outputDir: OUTPUT_DIR,
		});

		const dmlFiles = fs.readdirSync(path.join(OUTPUT_DIR, "dml")).sort();

		// master_data.sql の INSERT が roles と order_statuses に分かれる
		expect(dmlFiles).toContain("roles.sql");
		expect(dmlFiles).toContain("order_statuses.sql");
	});

	it("order_items に INDEX と FK 両方が統合される", async () => {
		await prepareSql({
			inputDirs: [MULTI_FILE_DIR],
			outputDir: OUTPUT_DIR,
		});

		const orderItemsSql = fs.readFileSync(path.join(OUTPUT_DIR, "ddl", "order_items.sql"), "utf-8");

		// indexes.sql の CREATE INDEX + alter_tables.sql の ALTER TABLE ADD CONSTRAINT が統合
		expect(orderItemsSql).toContain("idx_order_items_order_id");
		expect(orderItemsSql).toContain("fk_order_items_order_id");
	});
});
