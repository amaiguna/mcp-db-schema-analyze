import * as fs from "node:fs";
import * as path from "node:path";
export function writeSqlFile(dir, filename, content) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}
//# sourceMappingURL=sql-file-writer.js.map