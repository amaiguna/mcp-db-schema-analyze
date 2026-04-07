import * as fs from "node:fs";
import * as path from "node:path";

export interface SqlFileIndex {
	ddlFiles: Map<string, string>; // tableName → filePath
	dmlFiles: Map<string, string>;
}

/**
 * prepare済みディレクトリ群をスキャンし、テーブル名→ファイルパスの対応表を構築する。
 * SQLのパースは行わない。ファイル名(.sql拡張子を除いた部分)をテーブル名とみなす。
 *
 * ディレクトリ名が "dml" を含む場合は DML、それ以外は DDL として分類する。
 */
export function scanSqlDirs(dirs: string[]): SqlFileIndex {
	const ddlFiles = new Map<string, string>();
	const dmlFiles = new Map<string, string>();

	for (const dir of dirs) {
		if (!fs.existsSync(dir)) {
			throw new Error(`Directory not found: ${dir}`);
		}
		const isDml = path.basename(dir) === "dml";
		const target = isDml ? dmlFiles : ddlFiles;
		collectSqlEntries(dir, target);
	}

	return { ddlFiles, dmlFiles };
}

function collectSqlEntries(dir: string, target: Map<string, string>): void {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectSqlEntries(fullPath, target);
		} else if (entry.name.endsWith(".sql")) {
			const tableName = entry.name.replace(/\.sql$/, "");
			target.set(tableName, fullPath);
		}
	}
}
