import type { Column, Schema } from "./types.ts";

/**
 * Returns a filtered version of a schema by excluding all columns
 * that match the given list of patterns.
 *
 * The patterns are matched against the string
 * `schemaName.tableName.columnName`.
 */
const excludeFields = (schema: Schema, patterns: RegExp[]): Schema => {
  const kept = new Set<string>();
  const tables = schema.tables.map(table => {
    const columns = table.columns.filter(column => {
      const path = `${table.schema}.${table.name}.${column.name}`;
      if (patterns.some(pattern => pattern.test(path))) return false;
      kept.add(`${table.name}.${column.name}`);
      return true;
    });
    return { ...table, columns: columns.toSorted(compareColumns) };
  });

  const edges = schema.edges
    .filter(
      edge =>
        kept.has(`${edge.table}.${edge.column}`) && kept.has(`${edge.refTable}.${edge.refColumn}`),
    )
    .toSorted(
      (a, b) =>
        a.table.localeCompare(b.table) ||
        a.column.localeCompare(b.column) ||
        a.refTable.localeCompare(b.refTable) ||
        a.refColumn.localeCompare(b.refColumn),
    );

  return {
    schema: schema.schema,
    tables: tables.toSorted((a, b) => a.name.localeCompare(b.name)),
    edges,
  };
};

const compareColumns = (a: Column, b: Column): number => {
  const rankDiff = rank(a) - rank(b);
  if (rankDiff !== 0) return rankDiff;
  if (a.isPrimaryKey) return a.ordinal - b.ordinal;
  return a.name.localeCompare(b.name);
};

const rank = (column: Column): number => {
  if (column.isPrimaryKey) return 0;
  if (column.isForeignKey) return 1;
  return 2;
};

export { excludeFields };
