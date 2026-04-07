import { describe, expect, it } from "vitest";
import { DmlExtractor } from "../../../src/infrastructure/parser/dml-extractor";

// ---------------------------------------------------------------------------
// DML Extractor テスト
//
// 目的: INSERT文をパースし、マスタデータ (MasterData) として
//       テーブル名・カラム名・行データを正しく抽出できることを検証する。
// ---------------------------------------------------------------------------

describe("DmlExtractor", () => {
	const extractor = new DmlExtractor();

	describe("基本的な INSERT 文のパース", () => {
		it("カラム名と値を正しく抽出する", async () => {
			const sql = `
				INSERT INTO roles (id, name) VALUES (1, 'admin');
				INSERT INTO roles (id, name) VALUES (2, 'member');
			`;
			const result = await extractor.extract(sql);

			expect(result).toHaveLength(1); // テーブル単位でまとめる
			expect(result[0].table).toBe("roles");
			expect(result[0].columns).toEqual(["id", "name"]);
			expect(result[0].rows).toHaveLength(2);
			expect(result[0].rows[0]).toEqual({ id: 1, name: "admin" });
			expect(result[0].rows[1]).toEqual({ id: 2, name: "member" });
		});
	});

	describe("複数テーブルへの INSERT", () => {
		it("テーブルごとにグルーピングして返す", async () => {
			const sql = `
				INSERT INTO roles (id, name) VALUES (1, 'admin');
				INSERT INTO statuses (id, label) VALUES (1, 'active');
				INSERT INTO statuses (id, label) VALUES (2, 'inactive');
			`;
			const result = await extractor.extract(sql);

			expect(result).toHaveLength(2);

			const roles = result.find((m) => m.table === "roles");
			expect(roles?.rows).toHaveLength(1);

			const statuses = result.find((m) => m.table === "statuses");
			expect(statuses?.rows).toHaveLength(2);
		});
	});

	describe("複数行 VALUES の INSERT", () => {
		it("VALUES に複数行が含まれるケースを展開する", async () => {
			const sql = `
				INSERT INTO roles (id, name) VALUES
					(1, 'admin'),
					(2, 'member'),
					(3, 'guest');
			`;
			const result = await extractor.extract(sql);

			expect(result[0].rows).toHaveLength(3);
			expect(result[0].rows[2]).toEqual({ id: 3, name: "guest" });
		});
	});

	describe("様々な値の型", () => {
		it("数値・文字列・NULL・boolean を正しく変換する", async () => {
			const sql = `
				INSERT INTO config (id, label, rate, is_active, note) VALUES
					(1, 'default', 0.5, true, NULL);
			`;
			const result = await extractor.extract(sql);
			const row = result[0].rows[0];

			expect(row.id).toBe(1);
			expect(row.label).toBe("default");
			expect(row.rate).toBe(0.5);
			expect(row.is_active).toBe(true);
			expect(row.note).toBeNull();
		});
	});

	describe("複数SQLソースの統合", () => {
		it("extractMultiple で複数ファイル分のSQLを統合する", async () => {
			const file1 = "INSERT INTO roles (id, name) VALUES (1, 'admin');";
			const file2 = "INSERT INTO roles (id, name) VALUES (2, 'member');";
			const result = await extractor.extractMultiple([file1, file2]);

			// 同一テーブルへのINSERTは1つの MasterData にまとめる
			expect(result).toHaveLength(1);
			expect(result[0].rows).toHaveLength(2);
		});
	});
});
