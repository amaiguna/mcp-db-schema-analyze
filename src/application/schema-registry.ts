import * as fs from "node:fs";
import { Schema } from "../domain/model/schema.js";
import type { FindSharedColumnsOptions } from "../domain/model/schema.js";
import type { MasterData, Relation, SharedColumn, Table } from "../domain/model/types.js";
import { scanSqlDirs } from "../infrastructure/file/sql-file-scanner.js";
import { DdlExtractor } from "../infrastructure/parser/ddl-extractor.js";
import { DmlExtractor } from "../infrastructure/parser/dml-extractor.js";

export class SchemaRegistry {
	private readonly ddlFiles: Map<string, string>;
	private readonly dmlFiles: Map<string, string>;

	private readonly tableCache = new Map<string, Table>();
	private readonly masterDataCache = new Map<string, MasterData>();
	private fullSchema: Schema | null = null;

	private readonly ddlExtractor = new DdlExtractor();
	private readonly dmlExtractor = new DmlExtractor();

	constructor(sqlDirs: string[]) {
		const index = scanSqlDirs(sqlDirs);
		this.ddlFiles = index.ddlFiles;
		this.dmlFiles = index.dmlFiles;
	}

	/** テーブル名一覧 (ファイル名から即座に返す、パース不要) */
	getTableNames(): string[] {
		return [...this.ddlFiles.keys()].sort();
	}

	/** マスタデータを持つテーブル名一覧 (ファイル名から即座に返す) */
	getMasterDataTables(): string[] {
		return [...this.dmlFiles.keys()].sort();
	}

	/** 単テーブルのDDLを遅延パースして返す */
	async getTable(name: string): Promise<Table | undefined> {
		const cached = this.tableCache.get(name);
		if (cached) return cached;

		const filePath = this.ddlFiles.get(name);
		if (!filePath) return undefined;

		const sql = fs.readFileSync(filePath, "utf-8");
		const result = await this.ddlExtractor.extract(sql);
		const table = result.tables[0];
		if (table) {
			this.tableCache.set(name, table);
		}
		return table;
	}

	/** 単テーブルのDMLを遅延パースして返す */
	async getMasterDataForTable(name: string): Promise<MasterData | undefined> {
		const cached = this.masterDataCache.get(name);
		if (cached) return cached;

		const filePath = this.dmlFiles.get(name);
		if (!filePath) return undefined;

		const sql = fs.readFileSync(filePath, "utf-8");
		const result = await this.dmlExtractor.extract(sql);
		const data = result[0];
		if (data) {
			this.masterDataCache.set(name, data);
		}
		return data;
	}

	/** 横断操作: 指定テーブルが関与するリレーション (初回は全テーブルパース) */
	async getRelationsForTable(name: string): Promise<Relation[]> {
		const schema = await this.ensureFullSchema();
		return schema.getRelationsForTable(name);
	}

	/** 横断操作: テーブル間の同名カラム検出 (初回は全テーブルパース) */
	async findSharedColumns(options?: FindSharedColumnsOptions): Promise<SharedColumn[]> {
		const schema = await this.ensureFullSchema();
		return schema.findSharedColumns(options);
	}

	/** 全テーブルをパースして Schema を構築する (初回のみ、以降キャッシュ) */
	private async ensureFullSchema(): Promise<Schema> {
		if (this.fullSchema) return this.fullSchema;

		const allSqls: string[] = [];
		for (const filePath of this.ddlFiles.values()) {
			allSqls.push(fs.readFileSync(filePath, "utf-8"));
		}

		const ddlResult = await this.ddlExtractor.extractMultiple(allSqls);

		// テーブルキャッシュにも反映
		for (const table of ddlResult.tables) {
			this.tableCache.set(table.name, table);
		}

		const allDmlSqls: string[] = [];
		for (const filePath of this.dmlFiles.values()) {
			allDmlSqls.push(fs.readFileSync(filePath, "utf-8"));
		}
		const masterData =
			allDmlSqls.length > 0 ? await this.dmlExtractor.extractMultiple(allDmlSqls) : [];

		this.fullSchema = new Schema(ddlResult.tables, ddlResult.relations, masterData);
		return this.fullSchema;
	}
}
