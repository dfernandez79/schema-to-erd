import { defineConfig } from "bunup";

/**
 * Bundles the command for Node. Dependencies stay external, as bunup leaves
 * them: @d2lang/d2 loads its worker and WASM from beside its own module.
 */
export default defineConfig({
  entry: "src/schema-to-erd.ts",
  target: "node",
  // A command-line tool, with no API to declare types for.
  dts: false,
});
