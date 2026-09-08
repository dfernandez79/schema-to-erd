#!/usr/bin/env bun
import { HELP, HelpRequested, RunError, UsageError, parseOptions } from "./args.ts";
import { prepare } from "./filter.ts";
import { introspect } from "./introspect.ts";
import { renderD2 } from "./d2.ts";

export async function run(argv: string[], env: Record<string, string | undefined>): Promise<string> {
  const options = parseOptions(argv, env);
  const schema = await introspect(options.connectionString, options.schema, options.tables);
  return renderD2(prepare(schema, options.excludeFields), {
    types: options.types,
    nullableMarkers: options.nullableMarkers,
  });
}

async function main(): Promise<number> {
  let options;
  try {
    options = parseOptions(Bun.argv.slice(2), Bun.env);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(HELP);
      return 0;
    }
    if (error instanceof UsageError) {
      process.stderr.write(`schema-to-erd: ${error.message}\n\n${HELP}`);
      return 2;
    }
    throw error;
  }

  let output: string;
  try {
    const schema = await introspect(options.connectionString, options.schema, options.tables);
    output = renderD2(prepare(schema, options.excludeFields), {
      types: options.types,
      nullableMarkers: options.nullableMarkers,
    });
  } catch (error) {
    const message = error instanceof RunError ? error.message : (error as Error).message;
    process.stderr.write(`schema-to-erd: ${message}\n`);
    return 1;
  }

  if (options.output === null) process.stdout.write(output);
  else await Bun.write(options.output, output);
  return 0;
}

if (import.meta.main) process.exit(await main());
