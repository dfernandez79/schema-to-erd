import type { Column, Table } from "../types.ts";

/** Ordinals default to declaration order, as they would in a real table. */
const table = (name: string, columns: Column[], schema = "public"): Table => ({
  schema,
  name,
  columns: columns.map((c, i) => (c.ordinal === 0 ? { ...c, ordinal: i + 1 } : c)),
});

export { table };
