import { parseArgs } from "node:util";

import { HelpRequested, UsageError } from "../errors.ts";
import type { Options, TypeMode } from "../types.ts";

const TYPE_MODES: readonly string[] = ["none", "base", "full"] satisfies TypeMode[];

const parse = (argv: string[], env: Record<string, string | undefined>): Options => {
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
    excludeFields: compilePatterns(values["exclude-fields"]),
    types: resolveTypeMode(values.types, values["hide-types"] ?? false),
    nullableMarkers: !values["no-nullable-markers"],
    output: values.output,
  };
};

const resolveConnection = (
  database: string | undefined,
  env: Record<string, string | undefined>,
): string => {
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
};

const resolveSchema = (schema: string | undefined): string => {
  if (schema === undefined) return "public";
  if (schema === "") throw new UsageError("--schema cannot be empty");
  return schema;
};

const resolveTables = (tables: string | undefined): string[] | undefined => {
  if (tables === undefined) return undefined;
  const names = tables
    .split(",")
    .map(name => name.trim())
    .filter(name => name !== "");
  if (names.length === 0) throw new UsageError("--tables was given but lists no tables");

  const qualified = names.filter(name => name.includes("."));
  if (qualified.length > 0) {
    throw new UsageError(
      `--tables does not accept schema-qualified names (${qualified.join(", ")}); use --schema instead`,
    );
  }

  const seen = new Set<string>();
  return names.filter(name => (seen.has(name) ? false : (seen.add(name), true)));
};

const compilePatterns = (patterns: string[] = []): RegExp[] =>
  patterns.map(pattern => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new UsageError(
        `--exclude-fields='${pattern}' is not a valid regular expression: ${(error as Error).message}`,
      );
    }
  });

const resolveTypeMode = (types: string | undefined, hideTypes: boolean): TypeMode => {
  if (types !== undefined && hideTypes && types !== "none") {
    throw new UsageError(`--hide-types conflicts with --types=${types}`);
  }
  if (types === undefined) return hideTypes ? "none" : "base";
  if (!TYPE_MODES.includes(types)) {
    throw new UsageError(`--types must be one of ${TYPE_MODES.join(", ")}, got '${types}'`);
  }
  return types as TypeMode;
};

export { parse };
