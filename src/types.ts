export type TypeMode = "none" | "base" | "full";

export interface Column {
  name: string;
  /** Attribute number, i.e. physical order in the table definition. */
  ordinal: number;
  nullable: boolean;
  /** Shortened type without modifiers, e.g. `varchar`. */
  baseType: string;
  /** Raw `format_type()` output, e.g. `character varying(255)`. */
  fullType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
}

export interface Table {
  schema: string;
  name: string;
  columns: Column[];
}

export interface Edge {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
}

export interface Schema {
  schema: string;
  tables: Table[];
  edges: Edge[];
}
