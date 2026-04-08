import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/interface/cli/config";

// ---------------------------------------------------------------------------
// 設定ファイルテスト
//
// 目的: JSON設定ファイルからinput/outputパスを読み取れること、
//       Linux/Windowsどちらのパス記法でも正規化されることを検証する。
// ---------------------------------------------------------------------------

const FIXTURES_DIR = new URL("../../fixtures", import.meta.url).pathname;
const TMP_CONFIG_DIR = new URL("../../fixtures/.tmp-config", import.meta.url).pathname;

describe("loadConfig - 設定ファイルの読み込み", () => {
	it("JSONファイルから input と output を読み取る", () => {
		const configPath = `${FIXTURES_DIR}/config/mcp-db-schema.json`;
		const configDir = path.dirname(configPath);
		const config = loadConfig(configPath);

		// 相対パスは設定ファイル基準で解決される
		expect(config.inputDirs).toEqual([path.join(configDir, "raw-sql")]);
		expect(config.outputDir).toBe(path.join(configDir, "prepared"));
	});

	it("存在しない設定ファイルはエラーになる", () => {
		expect(() => loadConfig("/nonexistent/config.json")).toThrow();
	});

	it("input/output が未定義の設定ファイルはエラーになる", () => {
		// 空のJSONを作ってテスト
		fs.mkdirSync(TMP_CONFIG_DIR, { recursive: true });
		const emptyConfig = path.join(TMP_CONFIG_DIR, "empty.json");
		fs.writeFileSync(emptyConfig, "{}");

		expect(() => loadConfig(emptyConfig)).toThrow("input");

		fs.rmSync(TMP_CONFIG_DIR, { recursive: true, force: true });
	});
});

describe("loadConfig - クロスプラットフォームパス正規化", () => {
	beforeEach(() => {
		fs.mkdirSync(TMP_CONFIG_DIR, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(TMP_CONFIG_DIR, { recursive: true, force: true });
	});

	it("Windowsパス (バックスラッシュ) をスラッシュに正規化する", () => {
		const configPath = path.join(TMP_CONFIG_DIR, "win.json");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				input: ["C:\\Users\\dev\\sql\\ddl"],
				output: "C:\\Users\\dev\\prepared",
			}),
		);

		const config = loadConfig(configPath);

		// バックスラッシュがスラッシュに正規化されている
		expect(config.inputDirs[0]).toBe("C:/Users/dev/sql/ddl");
		expect(config.outputDir).toBe("C:/Users/dev/prepared");
	});

	it("Unixパスはそのまま保持される", () => {
		const configPath = path.join(TMP_CONFIG_DIR, "unix.json");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				input: ["/home/dev/sql/ddl"],
				output: "/home/dev/prepared",
			}),
		);

		const config = loadConfig(configPath);

		expect(config.inputDirs[0]).toBe("/home/dev/sql/ddl");
		expect(config.outputDir).toBe("/home/dev/prepared");
	});

	it("設定ファイルのパスが相対パスなら設定ファイル基準で解決される", () => {
		const configPath = path.join(TMP_CONFIG_DIR, "relative.json");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				input: ["./sql/ddl"],
				output: "./prepared",
			}),
		);

		const config = loadConfig(configPath);

		// 設定ファイルがあるディレクトリを基準に解決
		expect(config.inputDirs[0]).toBe(path.join(TMP_CONFIG_DIR, "sql/ddl"));
		expect(config.outputDir).toBe(path.join(TMP_CONFIG_DIR, "prepared"));
	});
});
