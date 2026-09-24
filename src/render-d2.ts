import type { Column, Schema, TypeMode } from "./types.ts";

type RenderOptions = {
  types: TypeMode;
  nullableMarkers: boolean;
};

type Constraint = "primary_key" | "foreign_key" | "unique";

type Size = { width: number; height: number };

type D2Options = RenderOptions & {
  /** Box sizes by table name, for a caller that sets the text itself. */
  tableSizes?: ReadonlyMap<string, Size>;
};

/**
 * Identifiers are quoted unconditionally. A column named `style`,
 * `width` or `shape` collides with a D2 keyword and fails to compile
 * otherwise.
 */
const quote = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const constraintsOf = (column: Column): Constraint[] => {
  const constraints: Constraint[] = [];
  if (column.isPrimaryKey) constraints.push("primary_key");
  if (column.isForeignKey) constraints.push("foreign_key");
  // A primary key is already unique; saying so twice is noise.
  if (column.isUnique && !column.isPrimaryKey) constraints.push("unique");
  return constraints;
};

/** The marker rides on the name, so it survives --types=none. */
const columnLabel = (column: Column, options: RenderOptions): string =>
  column.name + (options.nullableMarkers && column.nullable ? "?" : "");

/** The type as the type mode shows it, or `undefined` when it hides types. */
const typeLabel = (column: Column, options: RenderOptions): string | undefined => {
  if (options.types === "none") return undefined;
  return options.types === "full" ? column.fullType : column.baseType;
};

const renderColumn = (column: Column, options: RenderOptions): string => {
  const name = quote(columnLabel(column, options));
  const constraints = constraintsOf(column);
  const suffix =
    constraints.length === 0
      ? ""
      : constraints.length === 1
        ? ` {constraint: ${constraints[0]}}`
        : ` {constraint: [${constraints.join("; ")}]}`;

  const type = typeLabel(column, options);
  if (type === undefined) return `  ${name}${suffix}`;
  return `  ${name}: ${quote(type)}${suffix}`;
};

const renderD2 = (schema: Schema, options: D2Options): string => {
  const blocks = schema.tables.map(table => {
    const size = options.tableSizes?.get(table.name);
    return [
      `${quote(table.name)}: {`,
      "  shape: sql_table",
      ...(size ? [`  width: ${size.width}`, `  height: ${size.height}`] : []),
      ...table.columns.map(column => renderColumn(column, options)),
      "}",
    ].join("\n");
  });

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

export {
  type Constraint,
  type RenderOptions,
  type Size,
  columnLabel,
  constraintsOf,
  renderD2,
  typeLabel,
};
