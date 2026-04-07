import * as fs from "node:fs";
import * as path from "node:path";
export async function readSqlFiles(dirs) {
    const contents = [];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            throw new Error(`Directory not found: ${dir}`);
        }
        const files = collectSqlFiles(dir);
        for (const file of files) {
            contents.push(fs.readFileSync(file, "utf-8"));
        }
    }
    return contents;
}
function collectSqlFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectSqlFiles(fullPath));
        }
        else if (entry.name.endsWith(".sql")) {
            results.push(fullPath);
        }
    }
    return results.sort();
}
//# sourceMappingURL=sql-file-reader.js.map