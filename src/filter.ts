import type { Column, Schema } from "./types.ts";

/**
 * Drops excluded columns, then any edge left dangling by them, and puts what
 * survives into a deterministic order so output diffs cleanly between runs.
 */
export function prepare(schema: Schema, excludeFields: RegExp[]): Schema {
  const kept = new Set<string>();
  const tables = schema.tables.map((table) => {
    const columns = table.columns.filter((column) => {
      const path = `${table.schema}.${table.name}.${column.name}`;
      if (excludeFields.some((pattern) => pattern.test(path))) return false;
      kept.add(`${table.name}.${column.name}`);
      return true;
    });
    return { ...table, columns: columns.sort(compareColumns) };
  });

  const edges = schema.edges
    .filter(
      (edge) =>
        kept.has(`${edge.table}.${edge.column}`) &&
        kept.has(`${edge.refTable}.${edge.refColumn}`),
    )
    .sort(
      (a, b) =>
        a.table.localeCompare(b.table) ||
        a.column.localeCompare(b.column) ||
        a.refTable.localeCompare(b.refTable) ||
        a.refColumn.localeCompare(b.refColumn),
    );

  return {
    schema: schema.schema,
    tables: tables.sort((a, b) => a.name.localeCompare(b.name)),
    edges,
  };
}

/**
 * Keys float to the top of the box: primary keys first in their declared
 * order, since a composite key's order is meaningful, then foreign keys, then
 * everything else alphabetically.
 */
function compareColumns(a: Column, b: Column): number {
  const rankDiff = rank(a) - rank(b);
  if (rankDiff !== 0) return rankDiff;
  if (a.isPrimaryKey) return a.ordinal - b.ordinal;
  return a.name.localeCompare(b.name);
}

function rank(column: Column): number {
  if (column.isPrimaryKey) return 0;
  if (column.isForeignKey) return 1;
  return 2;
}
