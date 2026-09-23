import { describe, expect, test } from "bun:test";

import { cli } from "./cli.ts";
import { captureOutput } from "./test-helpers/capture-output.ts";
import { NO_DATABASE, testDatabaseUrl } from "./test-helpers/test-database-url.ts";

const run = async (tables?: string[]): Promise<string> => {
  const stdout = captureOutput();
  const stderr = captureOutput();
  const code = await cli(
    { connectionString: testDatabaseUrl(), tables, nullableMarkers: true },
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
    expect(output).toContain(`"users"."manager_id" -> "users"."id"`);

    if (Bun.which("d2") === null) return;
    const path = `${import.meta.dir}/../node_modules/.cache/erd.d2`;
    await Bun.write(path, output);
    const compiled = Bun.spawnSync(["d2", "--layout=elk", path, "/dev/null"]);
    // d2 reports success on stderr too, so look for its error prefix.
    expect(new TextDecoder().decode(compiled.stderr)).not.toContain("err:");
    expect(compiled.exitCode).toBe(0);
  });

  test("orders columns key-first in real output", async () => {
    const names = [...(await run(["users"])).matchAll(/^ {2}"([^"?]+)\??"/gm)].map(m => m[1]!);
    expect(names[0]).toBe("id");
    expect(names[1]).toBe("manager_id");
    expect(names.slice(2)).toEqual(names.slice(2).toSorted());
  });

  test("output stays stable for a known table", async () => {
    expect(await run(["order_items"])).toBe(
      `"order_items": {
  shape: sql_table
  "id": "uuid" {constraint: primary_key}
  "order_id": "uuid" {constraint: foreign_key}
  "tenant_id": "uuid" {constraint: foreign_key}
}
`,
    );
  });

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
