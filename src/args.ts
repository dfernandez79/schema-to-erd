import { parseArgs } from "node:util";
import type { TypeMode } from "./types.ts";

/** A problem with how the command was invoked. Exits 2. */
export class UsageError extends Error {}

/** A problem encountered while doing the work. Exits 1. */
export class RunError extends Error {}

/** Thrown for `--help`, which is a success. */
export class HelpRequested extends Error {}

export interface Options {
  connectionString: string;
  schema: string;
  /** Selected table names, or null for every table in the schema. */
  tables: string[] | null;
  excludeFields: RegExp[];
  types: TypeMode;
  nullableMarkers: boolean;
  output: string | null;
}

export const HELP = `schema-to-erd - generate a D2 ERD from a PostgreSQL schema

Usage:
  schema-to-erd [options]

Connection:
  --database=<url>        PostgreSQL connection URL (postgres:// or postgresql://).
                          Defaults to $DATABASE_URL.

Selection:
  --tables=a,b            Only these tables. Omit for every table in the schema.
                          Schema-qualified names are not accepted; use --schema.
  --schema=<name>         Schema to read. Default: public.

Rendering:
  --types=none|base|full  Column type detail. Default: base.
                            none  no types at all
                            base  varchar, numeric, timestamptz
                            full  character varying(255), numeric(10,2)
  --hide-types            Alias for --types=none.
  --no-nullable-markers   Do not append '?' to nullable column names.
  --exclude-fields=<re>   Drop columns whose 'schema.table.field' path matches
                          this regular expression. Unanchored and
                          case-sensitive. Repeatable.

Output:
  --output=<path>         Write to this file, overwriting it. Default: stdout.
  -h, --help              Show this help.

Examples:
  schema-to-erd --database=postgres://localhost/shop
  schema-to-erd --tables=orders,order_items --schema=sales
  schema-to-erd --tables=orders --exclude-fields='orders\\.updatedAt'
  schema-to-erd --types=none --output=erd.d2
`;

const TYPE_MODES: readonly string[] = ["none", "base", "full"];

export function parseOptions(
  argv: string[],
  env: Record<string, string | undefined>,
): Options {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        database: { type: "string" },
        tables: { type: "string" },
        schema: { type: "string" },
        "exclude-fields": { type: "string", multiple: true },
        types: { type: "string" },
        "hide-types": { type: "boolean" },
        "no-nullable-markers": { type: "boolean" },
        output: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError((error as Error).message);
  }

  if (values.help) throw new HelpRequested();

  return {
    connectionString: resolveConnection(values.database, env),
    schema: resolveSchema(values.schema),
    tables: resolveTables(values.tables),
    excludeFields: compilePatterns(values["exclude-fields"] ?? []),
    types: resolveTypeMode(values.types, values["hide-types"] ?? false),
    nullableMarkers: !values["no-nullable-markers"],
    output: values.output ?? null,
  };
}

function resolveConnection(
  database: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (database !== undefined) {
    if (database === "") throw new UsageError("--database cannot be empty");
    if (!/^postgres(ql)?:\/\//.test(database)) {
      throw new UsageError(
        `--database must be a full connection URL starting with postgres:// or postgresql://, got '${database}'`,
      );
    }
    return database;
  }
  const fromEnv = env.DATABASE_URL;
  if (fromEnv === undefined || fromEnv === "") {
    throw new UsageError("no database given: pass --database=<url> or set DATABASE_URL");
  }
  return fromEnv;
}

function resolveSchema(schema: string | undefined): string {
  if (schema === undefined) return "public";
  if (schema === "") throw new UsageError("--schema cannot be empty");
  return schema;
}

function resolveTables(tables: string | undefined): string[] | null {
  if (tables === undefined) return null;
  const names = tables
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names.length === 0) throw new UsageError("--tables was given but lists no tables");

  const qualified = names.filter((name) => name.includes("."));
  if (qualified.length > 0) {
    throw new UsageError(
      `--tables does not accept schema-qualified names (${qualified.join(", ")}); use --schema instead`,
    );
  }

  const seen = new Set<string>();
  return names.filter((name) => (seen.has(name) ? false : (seen.add(name), true)));
}

function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new UsageError(
        `--exclude-fields='${pattern}' is not a valid regular expression: ${(error as Error).message}`,
      );
    }
  });
}

function resolveTypeMode(types: string | undefined, hideTypes: boolean): TypeMode {
  if (types !== undefined && hideTypes && types !== "none") {
    throw new UsageError(`--hide-types conflicts with --types=${types}`);
  }
  if (types === undefined) return hideTypes ? "none" : "base";
  if (!TYPE_MODES.includes(types)) {
    throw new UsageError(`--types must be one of ${TYPE_MODES.join(", ")}, got '${types}'`);
  }
  return types as TypeMode;
}
