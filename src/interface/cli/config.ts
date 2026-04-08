import * as fs from "node:fs";
import * as path from "node:path";
import type { PrepareSqlOptions } from "../../application/prepare-sql.js";

interface ConfigJson {
	input?: string[];
	output?: string;
}

/** バックスラッシュをスラッシュに正規化する */
function normalizePath(p: string): string {
	return p.replace(/\\/g, "/");
}

/** Windows絶対パス (C:/ 等) を判定する */
function isWindowsAbsolute(p: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(p);
}

/** 相対パスなら configDir を基準に解決し、絶対パスはそのまま正規化して返す */
function resolvePath(p: string, configDir: string): string {
	const normalized = normalizePath(p);
	if (path.isAbsolute(normalized) || isWindowsAbsolute(normalized)) return normalized;
	return path.join(configDir, normalized);
}

export function loadConfig(configPath: string): PrepareSqlOptions {
	if (!fs.existsSync(configPath)) {
		throw new Error(`Config file not found: ${configPath}`);
	}

	const raw = fs.readFileSync(configPath, "utf-8");
	const json: ConfigJson = JSON.parse(raw);

	if (!json.input) {
		throw new Error("Config file must have 'input' field");
	}
	if (!json.output) {
		throw new Error("Config file must have 'output' field");
	}

	const configDir = path.dirname(path.resolve(configPath));

	return {
		inputDirs: json.input.map((p) => resolvePath(p, configDir)),
		outputDir: resolvePath(json.output, configDir),
	};
}
