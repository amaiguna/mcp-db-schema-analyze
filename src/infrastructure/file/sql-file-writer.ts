import * as fs from "node:fs";
import * as path from "node:path";

export function writeSqlFile(dir: string, filename: string, content: string): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}
