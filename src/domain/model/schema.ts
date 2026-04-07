import type { MasterData, Relation, SharedColumn, Table } from "./types.js";

export interface FindSharedColumnsOptions {
	excludePatterns?: string[];
}

export class Schema {
	private readonly tableMap: Map<string, Table>;

	constructor(
		tables: Table[],
		private readonly relations: Relation[],
		private readonly masterData: MasterData[],
	) {
		this.tableMap = new Map(tables.map((t) => [t.name, t]));
	}

	getTableNames(): string[] {
		return [...this.tableMap.keys()].sort();
	}

	getTable(name: string): Table | undefined {
		return this.tableMap.get(name);
	}

	getRelationsForTable(tableName: string): Relation[] {
		return this.relations.filter((r) => r.fromTable === tableName || r.toTable === tableName);
	}

	getMasterDataForTable(tableName: string): MasterData | undefined {
		return this.masterData.find((m) => m.table === tableName);
	}

	getMasterDataTables(): string[] {
		return this.masterData.map((m) => m.table).sort();
	}

	findTablesByColumnName(columnName: string): Table[] {
		return [...this.tableMap.values()].filter((t) => t.columns.some((c) => c.name === columnName));
	}

	findSharedColumns(options?: FindSharedColumnsOptions): SharedColumn[] {
		const excludes = new Set(options?.excludePatterns ?? []);
		const columnToTables = new Map<string, string[]>();

		for (const table of this.tableMap.values()) {
			for (const col of table.columns) {
				if (excludes.has(col.name)) continue;
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
