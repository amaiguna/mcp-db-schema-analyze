export interface Column {
	name: string;
	type: string;
	nullable: boolean;
	default: string | null;
	comment: string | null;
	isPrimaryKey: boolean;
}

export interface Constraint {
	type: "pk" | "fk" | "unique" | "check";
	columns: string[];
	references?: { table: string; columns: string[] };
}

export interface Index {
	name: string;
	columns: string[];
	unique: boolean;
}

export interface Table {
	name: string;
	columns: Column[];
	constraints: Constraint[];
	indexes: Index[];
	comment: string | null;
}

export type RelationSource = "fk" | "inferred";

export interface Relation {
	fromTable: string;
	fromColumns: string[];
	toTable: string;
	toColumns: string[];
	source: RelationSource;
}

export interface MasterData {
	table: string;
	columns: string[];
	rows: Record<string, unknown>[];
}

export interface SharedColumn {
	columnName: string;
	tables: string[];
}

export interface TableMetaEntry {
	comment: string | null;
}

export interface TableMeta {
	tables: Record<string, TableMetaEntry>;
}
