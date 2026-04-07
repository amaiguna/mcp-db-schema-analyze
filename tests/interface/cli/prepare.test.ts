import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, runPrepare } from "../../../src/interface/cli/prepare";

// ---------------------------------------------------------------------------
// prepare CLI テスト
//
// 目的: CLIの引数パース・バリデーション・実行フローを検証する。
//       ファイル出力の中身は prepare-sql.test.ts で既にカバー済みなので、
//       ここでは「引数が正しく解釈されるか」「エラー時に適切に失敗するか」を確認。
// ---------------------------------------------------------------------------

const FIXTURES_DIR = new URL("../../fixtures", import.meta.url).pathname;
const OUTPUT_DIR = new URL("../../fixtures/.tmp-cli-output", import.meta.url).pathname;

describe("prepare CLI - 引数パース", () => {
	it("--input と --output を正しくパースする", () => {
		const args = parseArgs(["prepare", "--input", "/path/to/sql", "--output", "/path/to/out"]);
		expect(args).toEqual({
			inputDirs: ["/path/to/sql"],
			outputDir: "/path/to/out",
		});
	});

	it("--input にカンマ区切りで複数ディレクトリを指定できる", () => {
		const args = parseArgs(["prepare", "--input", "/a,/b,/c", "--output", "/out"]);
		expect(args).toEqual({
			inputDirs: ["/a", "/b", "/c"],
			outputDir: "/out",
		});
	});

	it("--input が未指定の場合エラーになる", () => {
		expect(() => parseArgs(["prepare", "--output", "/out"])).toThrow("--input");
	});

	it("--output が未指定の場合エラーになる", () => {
		expect(() => parseArgs(["prepare", "--input", "/in"])).toThrow("--output");
	});

	it("prepare サブコマンドがない場合エラーになる", () => {
		expect(() => parseArgs(["--input", "/in", "--output", "/out"])).toThrow();
	});
});

describe("prepare CLI - 実行", () => {
	beforeEach(() => {
		fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
	});

	afterEach(() => {
		fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
	});

	it("runPrepare でフィクスチャを前処理して出力ディレクトリが作られる", async () => {
		await runPrepare({
			inputDirs: [`${FIXTURES_DIR}/mixed`],
			outputDir: OUTPUT_DIR,
		});

		expect(fs.existsSync(path.join(OUTPUT_DIR, "ddl"))).toBe(true);
		expect(fs.existsSync(path.join(OUTPUT_DIR, "dml"))).toBe(true);
	});

	it("存在しない入力ディレクトリでエラーメッセージを返す", async () => {
		await expect(
			runPrepare({ inputDirs: ["/nonexistent"], outputDir: OUTPUT_DIR }),
		).rejects.toThrow();
	});
});
