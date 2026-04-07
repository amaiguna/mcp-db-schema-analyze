import type { MasterData } from "../../domain/model/types.js";
export declare class DmlExtractor {
    extract(sql: string): Promise<MasterData[]>;
    extractMultiple(sqls: string[]): Promise<MasterData[]>;
    private processStatements;
}
//# sourceMappingURL=dml-extractor.d.ts.map