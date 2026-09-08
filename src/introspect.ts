import { SQL } from "bun";
import type { Column, Edge, Schema, Table } from "./types.ts";
import { RunError } from "./args.ts";

/**
 * `format_type(oid, NULL)` reports the SQL-standard spelling for these types,
 * which is accurate but long. Base mode prefers the short alias.
 */
const BASE_ALIASES: Record<string, string> = {
  "character varying": "varchar",
  character: "char",
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  "time with time zone": "timetz",
  "time without time zone": "time",
  "double precision": "float8",
  "bit varying": "varbit",
};

export function shortenType(type: string): string {
  const arraySuffix = type.match(/(\[\])+$/)?.[0] ?? "";
  const base = arraySuffix === "" ? type : type.slice(0, -arraySuffix.length);
  return (BASE_ALIASES[base] ?? base) + arraySuffix;
}

interface ColumnRow {
  table_name: string;
  name: string;
  ordinal: number;
  nullable: boolean;
  base_type: string;
  full_type: string;
}

interface ColumnRefRow {
  table_name: string;
  column_name: string;
}

interface ForeignKeyRow extends ColumnRefRow {
  ref_table: string;
  ref_column: string;
}

/**
 * Reads the schema over `pg_catalog` rather than `information_schema`, which
 * does not expose `relkind` or `relispartition`.
 */
export async function introspect(
  connectionString: string,
  schema: string,
  selected: string[] | null,
): Promise<Schema> {
  const sql = new SQL(connectionString);
  try {
    // Partitioned parents ('p') stand in for their partitions, which are
    // themselves 'r' and would otherwise each get their own box.
    const tableRows = (await sql`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema}
        AND c.relkind IN ('r', 'p')
        AND NOT c.relispartition
      ORDER BY c.relname
    `) as { name: string }[];

    const available = new Set(tableRows.map((row) => row.name));
    const included = resolveSelection(available, selected, schema);

    const columnRows = (await sql`
      SELECT c.relname AS table_name,
             a.attname AS name,
             a.attnum AS ordinal,
             NOT a.attnotnull AS nullable,
             format_type(a.atttypid, NULL) AS base_type,
             format_type(a.atttypid, a.atttypmod) AS full_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema}
        AND c.relkind IN ('r', 'p')
        AND NOT c.relispartition
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum
    `) as ColumnRow[];

    const primaryKeyRows = (await sql`
      SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey)
      WHERE n.nspname = ${schema} AND con.contype = 'p'
    `) as ColumnRefRow[];

    // Every column participating in a foreign key gets the badge, even though
    // only the first pair of a composite key gets an edge.
    const foreignKeyColumnRows = (await sql`
      SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey)
      WHERE n.nspname = ${schema} AND con.contype = 'f'
    `) as ColumnRefRow[];

    // Only single-column uniqueness is representable per column: badging every
    // member of a composite unique would claim each is unique on its own.
    const uniqueRows = (await sql`
      SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
      WHERE n.nspname = ${schema}
        AND con.contype = 'u'
        AND array_length(con.conkey, 1) = 1
      UNION
      SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
      WHERE n.nspname = ${schema}
        AND i.indisunique
        AND NOT i.indisprimary
        AND i.indnkeyatts = 1
    `) as ColumnRefRow[];

    // A composite foreign key is one relationship, so it draws one edge from
    // the first column pair.
    const edgeRows = (await sql`
      SELECT c.relname AS table_name,
             a.attname AS column_name,
             rc.relname AS ref_table,
             ra.attname AS ref_column
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class rc ON rc.oid = con.confrelid
      JOIN pg_namespace rn ON rn.oid = rc.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
      JOIN pg_attribute ra ON ra.attrelid = rc.oid AND ra.attnum = con.confkey[1]
      WHERE n.nspname = ${schema}
        AND rn.nspname = ${schema}
        AND con.contype = 'f'
    `) as ForeignKeyRow[];

    const primaryKeys = toKeySet(primaryKeyRows);
    const foreignKeys = toKeySet(foreignKeyColumnRows);
    const uniques = toKeySet(uniqueRows);

    const columnsByTable = new Map<string, Column[]>();
    for (const row of columnRows) {
      if (!included.has(row.table_name)) continue;
      const key = `${row.table_name}.${row.name}`;
      const column: Column = {
        name: row.name,
        ordinal: Number(row.ordinal),
        nullable: row.nullable,
        baseType: shortenType(row.base_type),
        fullType: row.full_type,
        isPrimaryKey: primaryKeys.has(key),
        isForeignKey: foreignKeys.has(key),
        isUnique: uniques.has(key),
      };
      const columns = columnsByTable.get(row.table_name);
      if (columns) columns.push(column);
      else columnsByTable.set(row.table_name, [column]);
    }

    const tables: Table[] = [...included]
      .sort()
      .map((name) => ({ schema, name, columns: columnsByTable.get(name) ?? [] }));

    const edges: Edge[] = edgeRows
      .filter((row) => included.has(row.table_name) && included.has(row.ref_table))
      .map((row) => ({
        table: row.table_name,
        column: row.column_name,
        refTable: row.ref_table,
        refColumn: row.ref_column,
      }));

    return { schema, tables, edges };
  } finally {
    await sql.close();
  }
}

function resolveSelection(
  available: Set<string>,
  selected: string[] | null,
  schema: string,
): Set<string> {
  if (selected === null) {
    if (available.size === 0) {
      throw new RunError(`no tables found in schema '${schema}'`);
    }
    return available;
  }
  const missing = selected.filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new RunError(
      `table(s) not found in schema '${schema}': ${missing.join(", ")}`,
    );
  }
  return new Set(selected);
}

function toKeySet(rows: ColumnRefRow[]): Set<string> {
  return new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
}
