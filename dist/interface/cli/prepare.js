import { prepareSql } from "../../application/prepare-sql.js";
export function parseArgs(argv) {
    if (argv[0] !== "prepare") {
        throw new Error("Unknown command. Usage: prepare --input <dirs> --output <dir>");
    }
    let input;
    let output;
    for (let i = 1; i < argv.length; i++) {
        if (argv[i] === "--input" && argv[i + 1]) {
            input = argv[++i];
        }
        else if (argv[i] === "--output" && argv[i + 1]) {
            output = argv[++i];
        }
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
export async function runPrepare(options) {
    await prepareSql(options);
}
//# sourceMappingURL=prepare.js.map