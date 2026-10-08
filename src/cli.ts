import { writeFile } from "node:fs/promises";

import postgres from "postgres";

import { RunError } from "./errors.ts";
import { excludeFields } from "./exclude-fields.ts";
import { introspect } from "./introspect.ts";
import { type RenderOptions, renderD2 } from "./render-d2.ts";
import { renderExcalidraw } from "./render-excalidraw.ts";
import { renderSvg } from "./render-svg.ts";
import type { Format, Options, Output, Schema } from "./types.ts";

const RENDERERS: Record<
  Format,
  (schema: Schema, options: RenderOptions) => string | Promise<string>
> = {
  d2: renderD2,
  svg: renderSvg,
  excalidraw: renderExcalidraw,
};

const cli = async (
  {
    output: outputFile,
    connectionString,
    schema = "public",
    tables,
    excludeFields: excludeFieldsPatterns = [],
    types = "base",
    nullableMarkers = false,
    format = "d2",
    layout,
  }: Options,
  stdout: Output,
  stderr: Output,
): Promise<number> => {
  try {
    const dbSchema = await readSchema(connectionString, schema, tables);
    const result = await RENDERERS[format](excludeFields(dbSchema, excludeFieldsPatterns), {
      types,
      nullableMarkers,
      layout,
    });

    if (outputFile) await writeFile(outputFile, result);
    else stdout.write(result);
  } catch (error) {
    const message = error instanceof RunError ? error.message : (error as Error).message;
    stderr.write(`schema-to-erd: ${message}\n`);
    return 1;
  }

  return 0;
};

/** Introspects over a connection that is closed before the diagram renders. */
const readSchema = async (
  connectionString: string,
  schema: string,
  tables?: string[],
): Promise<Schema> => {
  // postgres.js logs server notices to stdout, where they'd corrupt the diagram.
  const sql = postgres(connectionString, { onnotice: () => {} });
  try {
    return await introspect(sql, schema, tables);
  } finally {
    await sql.end();
  }
};

export { cli };
