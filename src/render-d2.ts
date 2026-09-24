import type { Column, Schema, TypeMode } from "./types.ts";

type RenderOptions = {
  types: TypeMode;
  nullableMarkers: boolean;
};

/**
 * Identifiers are quoted unconditionally. A column named `style`,
 * `width` or `shape` collides with a D2 keyword and fails to compile
 * otherwise.
 */
const quote = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const constraintsOf = (column: Column): string[] => {
  const constraints: string[] = [];
  if (column.isPrimaryKey) constraints.push("primary_key");
  if (column.isForeignKey) constraints.push("foreign_key");
  // A primary key is already unique; saying so twice is noise.
  if (column.isUnique && !column.isPrimaryKey) constraints.push("unique");
  return constraints;
};

/** The marker rides on the name, so it survives --types=none. */
const columnLabel = (column: Column, options: RenderOptions): string =>
  column.name + (options.nullableMarkers && column.nullable ? "?" : "");

const renderColumn = (column: Column, options: RenderOptions): string => {
  const name = quote(columnLabel(column, options));
  const constraints = constraintsOf(column);
  const suffix =
    constraints.length === 0
      ? ""
      : constraints.length === 1
        ? ` {constraint: ${constraints[0]}}`
        : ` {constraint: [${constraints.join("; ")}]}`;

  if (options.types === "none") return `  ${name}${suffix}`;
  const type = options.types === "full" ? column.fullType : column.baseType;
  return `  ${name}: ${quote(type)}${suffix}`;
};

const renderD2 = (schema: Schema, options: RenderOptions): string => {
  const blocks = schema.tables.map(table =>
    [
      `${quote(table.name)}: {`,
      "  shape: sql_table",
      ...table.columns.map(column => renderColumn(column, options)),
      "}",
    ].join("\n"),
  );

  // An edge must name a column exactly as its table declares it, marker
  // included. Any other name makes D2 add an empty row and point there.
  const tables = new Map(schema.tables.map(table => [table.name, table]));
  const endpoint = (tableName: string, columnName: string): string => {
    const column = tables.get(tableName)?.columns.find(c => c.name === columnName);
    return `${quote(tableName)}.${quote(column ? columnLabel(column, options) : columnName)}`;
  };

  const edges = schema.edges.map(
    edge => `${endpoint(edge.table, edge.column)} -> ${endpoint(edge.refTable, edge.refColumn)}`,
  );

  const sections = [...blocks];
  if (edges.length > 0) sections.push(edges.join("\n"));
  return sections.join("\n\n") + "\n";
};

export { type RenderOptions, renderD2 };
