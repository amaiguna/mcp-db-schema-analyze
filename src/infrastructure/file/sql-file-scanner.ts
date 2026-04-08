import * as fs from "node:fs";
import * as path from "node:path";

export interface SqlFileIndex {
	ddlFiles: Map<string, string>; // tableName → filePath
	dmlFiles: Map<string, string>;
	sequenceFiles: Map<string, string>; // sequenceName → filePath
	functionFiles: Map<string, string>; // functionName → filePath
}

/**
 * prepare済みディレクトリ群をスキャンし、テーブル名→ファイルパスの対応表を構築する。
 * SQLのパースは行わない。ファイル名(.sql拡張子を除いた部分)をテーブル名とみなす。
 *
 * ディレクトリ名で分類する:
 *   "dml" → DML, "sequences" → シーケンス, "functions" → 関数, それ以外 → DDL
 */
export function scanSqlDirs(dirs: string[]): SqlFileIndex {
	const ddlFiles = new Map<string, string>();
	const dmlFiles = new Map<string, string>();
	const sequenceFiles = new Map<string, string>();
	const functionFiles = new Map<string, string>();

	for (const dir of dirs) {
		if (!fs.existsSync(dir)) {
			throw new Error(`Directory not found: ${dir}`);
		}
		const basename = path.basename(dir);
		const target =
			basename === "dml"
				? dmlFiles
				: basename === "sequences"
					? sequenceFiles
					: basename === "functions"
						? functionFiles
						: ddlFiles;
		collectSqlEntries(dir, target);
	}

	return { ddlFiles, dmlFiles, sequenceFiles, functionFiles };
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
