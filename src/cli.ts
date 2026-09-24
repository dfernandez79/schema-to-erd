import { SQL } from "bun";

import { RunError } from "./errors.ts";
import { excludeFields } from "./exclude-fields.ts";
import { introspect } from "./introspect.ts";
import { type RenderOptions, renderD2 } from "./render-d2.ts";
import { renderSvg } from "./render-svg.ts";
import type { Format, Options, Output, Schema } from "./types.ts";

const RENDERERS: Record<
  Format,
  (schema: Schema, options: RenderOptions) => string | Promise<string>
> = {
  d2: renderD2,
  svg: renderSvg,
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
  }: Options,
  stdout: Output,
  stderr: Output,
): Promise<number> => {
  try {
    await using sql = new SQL(connectionString);
    const dbSchema = await introspect(sql, schema, tables);
    const result = await RENDERERS[format](excludeFields(dbSchema, excludeFieldsPatterns), {
      types,
      nullableMarkers,
    });

    const output = outputFile ? Bun.file(outputFile) : stdout;
    await output.write(result);
  } catch (error) {
    const message = error instanceof RunError ? error.message : (error as Error).message;
    stderr.write(`schema-to-erd: ${message}\n`);
    return 1;
  }

  return 0;
};

export { cli };
