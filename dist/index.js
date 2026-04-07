import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./interface/mcp/server.js";
const sqlDirs = process.env.SQL_DIRS?.split(",").filter(Boolean) ?? [];
if (sqlDirs.length === 0) {
    console.error("Error: SQL_DIRS environment variable is required.");
    process.exit(1);
}
const server = createMcpServer(sqlDirs);
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map