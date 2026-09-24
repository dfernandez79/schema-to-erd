import { layOut, withD2 } from "./d2-wasm.ts";
import { type RenderOptions, renderD2 } from "./render-d2.ts";
import type { Schema } from "./types.ts";

/** Renders the D2 source in-process, as `d2 --layout=elk` would. */
const renderSvg = (schema: Schema, options: RenderOptions): Promise<string> =>
  withD2(async d2 => {
    const { diagram, renderOptions } = await layOut(d2, renderD2(schema, options));
    return d2.render(diagram, renderOptions);
  });

export { renderSvg };
