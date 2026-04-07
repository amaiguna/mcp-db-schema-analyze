import type { Relation, Table } from "../../domain/model/types.js";
export interface DdlExtractResult {
    tables: Table[];
    relations: Relation[];
}
export declare class DdlExtractor {
    extract(sql: string): Promise<DdlExtractResult>;
    extractMultiple(sqls: string[]): Promise<DdlExtractResult>;
    private processStatements;
    private processCreateStmt;
    private processTableConstraint;
    private processCommentStmt;
    private processIndexStmt;
    private processAlterTableStmt;
}
//# sourceMappingURL=ddl-extractor.d.ts.map