import { type PrepareSqlOptions, prepareSql } from "../../application/prepare-sql.js";
import { loadConfig } from "./config.js";

export function parseArgs(argv: string[]): PrepareSqlOptions {
	if (argv[0] !== "prepare") {
		throw new Error("Unknown command. Usage: prepare --input <dirs> --output <dir>");
	}

	let input: string | undefined;
	let output: string | undefined;
	let configPath: string | undefined;

	for (let i = 1; i < argv.length; i++) {
		if (argv[i] === "--input" && argv[i + 1]) {
			input = argv[++i];
		} else if (argv[i] === "--output" && argv[i + 1]) {
			output = argv[++i];
		} else if (argv[i] === "--config" && argv[i + 1]) {
			configPath = argv[++i];
		}
	}

	// --config がある場合、設定ファイルから読み込み (--input/--output で上書き可能)
	if (configPath) {
		const fromConfig = loadConfig(configPath);
		return {
			inputDirs: input ? input.split(",") : fromConfig.inputDirs,
			outputDir: output ?? fromConfig.outputDir,
		};
	}

	if (!input) {
		throw new Error("--input is required. Usage: prepare --input <dirs> --output <dir>");
	}
	if (!output) {
		throw new Error("--output is required. Usage: prepare --input <dirs> --output <dir>");
	}

	return {
		inputDirs: input.split(","),
		outputDir: output,
	};
}

export async function runPrepare(options: PrepareSqlOptions): Promise<void> {
	await prepareSql(options);
}
