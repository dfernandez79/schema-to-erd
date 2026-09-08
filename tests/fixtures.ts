import type { Column, Schema, Table } from "../src/types.ts";

export function column(name: string, overrides: Partial<Column> = {}): Column {
  return {
    name,
    ordinal: 0,
    nullable: false,
    baseType: "text",
    fullType: "text",
    isPrimaryKey: false,
    isForeignKey: false,
    isUnique: false,
    ...overrides,
  };
}

/** Ordinals default to declaration order, as they would in a real table. */
export function table(name: string, columns: Column[], schema = "public"): Table {
  return {
    schema,
    name,
    columns: columns.map((c, i) => (c.ordinal === 0 ? { ...c, ordinal: i + 1 } : c)),
  };
}

export function schemaOf(tables: Table[], edges: Schema["edges"] = []): Schema {
  return { schema: "public", tables, edges };
}
