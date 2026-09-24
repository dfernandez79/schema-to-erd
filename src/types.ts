import type { BunFile } from "bun";

type TypeMode = "none" | "base" | "full";

type Format = "d2" | "svg" | "excalidraw";

type Options = {
  connectionString: string;
  schema?: string;
  tables?: string[];
  excludeFields?: RegExp[];
  types?: TypeMode;
  nullableMarkers?: boolean;
  format?: Format;
  output?: string;
};

type Output = Pick<BunFile, "write">;

type Column = {
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
};

type Table = {
  schema: string;
  name: string;
  columns: Column[];
};

type Edge = {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
};

type Schema = {
  schema: string;
  tables: Table[];
  edges: Edge[];
};

export type { Options, Column, Edge, Format, Output, Schema, Table, TypeMode };
