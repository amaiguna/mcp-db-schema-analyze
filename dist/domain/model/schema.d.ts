import type { MasterData, Relation, SharedColumn, Table } from "./types.js";
export interface FindSharedColumnsOptions {
    excludePatterns?: string[];
}
export declare class Schema {
    private readonly relations;
    private readonly masterData;
    private readonly tableMap;
    constructor(tables: Table[], relations: Relation[], masterData: MasterData[]);
    getTableNames(): string[];
    getTable(name: string): Table | undefined;
    getRelationsForTable(tableName: string): Relation[];
    getMasterDataForTable(tableName: string): MasterData | undefined;
    getMasterDataTables(): string[];
    findTablesByColumnName(columnName: string): Table[];
    findSharedColumns(options?: FindSharedColumnsOptions): SharedColumn[];
}
//# sourceMappingURL=schema.d.ts.map