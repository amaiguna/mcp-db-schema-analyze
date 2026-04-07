import { parseArgs, runPrepare } from "./interface/cli/prepare.js";

async function main() {
	try {
		const options = parseArgs(process.argv.slice(2));
		await runPrepare(options);
		console.log("Done.");
	} catch (error) {
		console.error(`Error: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
}

main();
