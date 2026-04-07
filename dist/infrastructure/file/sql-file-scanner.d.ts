export interface SqlFileIndex {
    ddlFiles: Map<string, string>;
    dmlFiles: Map<string, string>;
}
/**
 * prepare済みディレクトリ群をスキャンし、テーブル名→ファイルパスの対応表を構築する。
 * SQLのパースは行わない。ファイル名(.sql拡張子を除いた部分)をテーブル名とみなす。
 *
 * ディレクトリ名が "dml" を含む場合は DML、それ以外は DDL として分類する。
 */
export declare function scanSqlDirs(dirs: string[]): SqlFileIndex;
//# sourceMappingURL=sql-file-scanner.d.ts.map