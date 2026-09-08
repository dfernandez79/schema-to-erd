import type { Column, Schema, TypeMode } from "./types.ts";

export interface RenderOptions {
  types: TypeMode;
  nullableMarkers: boolean;
}

/**
 * Identifiers are quoted unconditionally. A column genuinely named `style`,
 * `width` or `shape` collides with a D2 keyword and fails to compile
 * otherwise.
 */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function constraintsOf(column: Column): string[] {
  const constraints: string[] = [];
  if (column.isPrimaryKey) constraints.push("primary_key");
  if (column.isForeignKey) constraints.push("foreign_key");
  // A primary key is already unique; saying so twice is noise.
  if (column.isUnique && !column.isPrimaryKey) constraints.push("unique");
  return constraints;
}

function renderColumn(column: Column, options: RenderOptions): string {
  // The marker rides on the name, so it survives --types=none.
  const name = quote(column.name + (options.nullableMarkers && column.nullable ? "?" : ""));
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
}

export function renderD2(schema: Schema, options: RenderOptions): string {
  const blocks = schema.tables.map((table) =>
    [
      `${quote(table.name)}: {`,
      "  shape: sql_table",
      ...table.columns.map((column) => renderColumn(column, options)),
      "}",
    ].join("\n"),
  );

  const edges = schema.edges.map(
    (edge) =>
      `${quote(edge.table)}.${quote(edge.column)} -> ${quote(edge.refTable)}.${quote(edge.refColumn)}`,
  );

  const sections = [...blocks];
  if (edges.length > 0) sections.push(edges.join("\n"));
  return sections.join("\n\n") + "\n";
}
