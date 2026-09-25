import { describe, expect, test } from "bun:test";

import { cli } from "./cli.ts";
import { captureOutput } from "./test-helpers/capture-output.ts";
import { NO_DATABASE, testDatabaseUrl } from "./test-helpers/test-database-url.ts";
import type { Layout, Options } from "./types.ts";

const LAYOUTS: Layout[] = ["elk", "dagre", "tala"];

const run = async (options: Omit<Options, "connectionString"> = {}): Promise<string> => {
  const stdout = captureOutput();
  const stderr = captureOutput();
  const code = await cli(
    { connectionString: testDatabaseUrl(), nullableMarkers: true, ...options },
    stdout,
    stderr,
  );
  expect(stderr.text()).toBe("");
  expect(code).toBe(0);
  return stdout.text();
};

describe.skipIf(NO_DATABASE)("cli", () => {
  test("emits D2 the d2 compiler accepts, keyword column names included", async () => {
    const output = await run();
    expect(output).toContain(`"shape": {`);
    expect(output).toContain(`"style?": "text"`);
    expect(output).toContain(`"width?": "integer"`);
    expect(output).toContain(`"near?": "text"`);
    expect(output).toContain(`"users"."manager_id?" -> "users"."id"`);

    if (Bun.which("d2") === null) return;
    const path = `${import.meta.dir}/../node_modules/.cache/erd.d2`;
    await Bun.write(path, output);
    const compiled = Bun.spawnSync(["d2", "--layout=elk", path, "/dev/null"]);
    // d2 reports success on stderr too, so look for its error prefix.
    expect(new TextDecoder().decode(compiled.stderr)).not.toContain("err:");
    expect(compiled.exitCode).toBe(0);
  });

  test("orders columns key-first in real output", async () => {
    const names = [...(await run({ tables: ["users"] })).matchAll(/^ {2}"([^"?]+)\??"/gm)].map(
      m => m[1]!,
    );
    expect(names[0]).toBe("id");
    expect(names[1]).toBe("manager_id");
    expect(names.slice(2)).toEqual(names.slice(2).toSorted());
  });

  test("output stays stable for a known table", async () => {
    expect(await run({ tables: ["order_items"] })).toBe(
      `"order_items": {
  shape: sql_table
  "id": "uuid" {constraint: primary_key}
  "order_id": "uuid" {constraint: foreign_key}
  "tenant_id": "uuid" {constraint: foreign_key}
}
`,
    );
  });

  test("names the layout engine for the d2 CLI when given one", async () => {
    const tables = ["orders", "order_items"];
    expect(await run({ tables, layout: "dagre" })).toStartWith(
      "vars: {\n  d2-config: {\n    layout-engine: dagre\n  }\n}\n\n",
    );

    if (Bun.which("d2") === null) return;
    // Only recent d2 releases bundle TALA.
    const engines = new TextDecoder().decode(Bun.spawnSync(["d2", "layout"]).stdout);
    for (const layout of LAYOUTS.filter(engine => engines.includes(`${engine} (bundled)`))) {
      const path = `${import.meta.dir}/../node_modules/.cache/erd-${layout}`;
      await Bun.write(`${path}.d2`, await run({ tables, layout }));
      // No --layout here: the file's own d2-config has to pick the engine.
      const compiled = Bun.spawnSync(["d2", `${path}.d2`, `${path}.svg`]);
      expect(compiled.exitCode).toBe(0);
      const arrow = (await Bun.file(`${path}.svg`).text()).match(
        /<path d="([^"]*)"[^>]*class="connection stroke-/,
      )?.[1];
      // ELK and TALA draw right angles; dagre, Bézier curves.
      expect(arrow?.includes(" C ")).toBe(layout === "dagre");
    }
  });

  test.each(LAYOUTS)(
    "lays out the whole database as SVG with %s",
    async layout => {
      const svg = await run({ format: "svg", layout });
      for (const name of ["order_items", "orders", "users", "shape", "events"]) {
        expect(svg).toContain(`>${name}</text>`);
      }
      // users.manager_id -> users.id, and the composite order_items -> orders.
      expect(svg.match(/class="connection stroke-/g)).toHaveLength(2);
    },
    30_000,
  );

  test.each(LAYOUTS)(
    "lays out the whole database as Excalidraw with %s",
    async layout => {
      const scene = JSON.parse(await run({ format: "excalidraw", layout })) as {
        elements: { type: string; text?: string; startBinding?: object; endBinding?: object }[];
      };
      const texts = scene.elements.flatMap(e => e.text ?? []);
      for (const name of ["order_items", "orders", "users", "shape", "events", "near?"]) {
        expect(texts).toContain(name);
      }
      const arrows = scene.elements.filter(e => e.type === "arrow");
      expect(arrows).toHaveLength(2);
      for (const arrow of arrows) {
        expect(arrow.startBinding).toBeDefined();
        expect(arrow.endBinding).toBeDefined();
      }
    },
    30_000,
  );

  test("reports a failure on stderr and exits 1", async () => {
    const stdout = captureOutput();
    const stderr = captureOutput();
    const code = await cli(
      { connectionString: testDatabaseUrl(), tables: ["nope"] },
      stdout,
      stderr,
    );
    expect(code).toBe(1);
    expect(stderr.text()).toContain("schema-to-erd: table(s) not found");
    expect(stdout.text()).toBe("");
  });
});
