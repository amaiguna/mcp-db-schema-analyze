export class Schema {
    relations;
    masterData;
    tableMap;
    constructor(tables, relations, masterData) {
        this.relations = relations;
        this.masterData = masterData;
        this.tableMap = new Map(tables.map((t) => [t.name, t]));
    }
    getTableNames() {
        return [...this.tableMap.keys()].sort();
    }
    getTable(name) {
        return this.tableMap.get(name);
    }
    getRelationsForTable(tableName) {
        return this.relations.filter((r) => r.fromTable === tableName || r.toTable === tableName);
    }
    getMasterDataForTable(tableName) {
        return this.masterData.find((m) => m.table === tableName);
    }
    getMasterDataTables() {
        return this.masterData.map((m) => m.table).sort();
    }
    findTablesByColumnName(columnName) {
        return [...this.tableMap.values()].filter((t) => t.columns.some((c) => c.name === columnName));
    }
    findSharedColumns(options) {
        const excludes = new Set(options?.excludePatterns ?? []);
        const columnToTables = new Map();
        for (const table of this.tableMap.values()) {
            for (const col of table.columns) {
                if (excludes.has(col.name))
                    continue;
                const tables = columnToTables.get(col.name) ?? [];
                tables.push(table.name);
                columnToTables.set(col.name, tables);
            }
        }
        return [...columnToTables.entries()]
            .filter(([, tables]) => tables.length >= 2)
            .map(([columnName, tables]) => ({ columnName, tables }));
    }
}
//# sourceMappingURL=schema.js.map