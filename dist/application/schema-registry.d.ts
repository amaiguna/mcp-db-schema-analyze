import type { FindSharedColumnsOptions } from "../domain/model/schema.js";
import type { MasterData, Relation, SharedColumn, Table } from "../domain/model/types.js";
export declare class SchemaRegistry {
    private readonly ddlFiles;
    private readonly dmlFiles;
    private readonly tableCache;
    private readonly masterDataCache;
    private fullSchema;
    private readonly ddlExtractor;
    private readonly dmlExtractor;
    constructor(sqlDirs: string[]);
    /** テーブル名一覧 (ファイル名から即座に返す、パース不要) */
    getTableNames(): string[];
    /** マスタデータを持つテーブル名一覧 (ファイル名から即座に返す) */
    getMasterDataTables(): string[];
    /** 単テーブルのDDLを遅延パースして返す */
    getTable(name: string): Promise<Table | undefined>;
    /** 単テーブルのDMLを遅延パースして返す */
    getMasterDataForTable(name: string): Promise<MasterData | undefined>;
    /** 横断操作: 指定テーブルが関与するリレーション (初回は全テーブルパース) */
    getRelationsForTable(name: string): Promise<Relation[]>;
    /** 横断操作: テーブル間の同名カラム検出 (初回は全テーブルパース) */
    findSharedColumns(options?: FindSharedColumnsOptions): Promise<SharedColumn[]>;
    /** 全テーブルをパースして Schema を構築する (初回のみ、以降キャッシュ) */
    private ensureFullSchema;
}
//# sourceMappingURL=schema-registry.d.ts.map