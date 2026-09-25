import { describe, expect, test } from "bun:test";

import { cli } from "../cli.ts";
import { captureOutput } from "../test-helpers/capture-output.ts";
import { NO_DATABASE, testDatabaseUrl } from "../test-helpers/test-database-url.ts";
import { runCliWithParsedArgs } from "./run-cli-with-parsed-args.ts";

const never = async (): Promise<number> => {
  throw new Error("the command should not have run");
};

describe("runCliWithParsedArgs", () => {
  test("--help prints the help on stdout and succeeds", async () => {
    const stdout = captureOutput();
    const stderr = captureOutput();
    expect(await runCliWithParsedArgs(never, ["--help"], stdout, stderr)).toBe(0);
    expect(stdout.text()).toContain("Usage:");
    expect(stderr.text()).toBe("");
  });

  test("a usage error goes to stderr and exits 2", async () => {
    const stdout = captureOutput();
    const stderr = captureOutput();
    expect(await runCliWithParsedArgs(never, ["--nope"], stdout, stderr)).toBe(2);
    expect(stderr.text()).toContain("schema-to-erd: ");
    expect(stdout.text()).toBe("");
  });

  test.skipIf(NO_DATABASE)("applies exclusions and type mode from the command line", async () => {
    const stdout = captureOutput();
    const stderr = captureOutput();
    const code = await runCliWithParsedArgs(
      cli,
      [
        `--database=${testDatabaseUrl()}`,
        "--tables=users",
        "--types=none",
        "--exclude-fields=users\\.nickname",
      ],
      stdout,
      stderr,
    );

    expect(code).toBe(0);
    const output = stdout.text();
    expect(output).not.toContain("nickname");
    expect(output).not.toContain("varchar");
    expect(output).toContain(`"seen_at?"`);
    expect(output).toContain(`"id" {constraint: primary_key}`);
  });

  test.skipIf(NO_DATABASE)(
    "writes an SVG when --output ends in .svg",
    async () => {
      const path = `${import.meta.dir}/../../node_modules/.cache/erd.svg`;
      const stdout = captureOutput();
      const stderr = captureOutput();
      const code = await runCliWithParsedArgs(
        cli,
        [`--database=${testDatabaseUrl()}`, "--tables=users", `--output=${path}`],
        stdout,
        stderr,
      );

      expect(stderr.text()).toBe("");
      expect(code).toBe(0);
      expect(stdout.text()).toBe("");
      const svg = await Bun.file(path).text();
      expect(svg).toStartWith("<?xml");
      expect(svg).toContain(">manager_id?</text>");
    },
    30_000,
  );

  test.skipIf(NO_DATABASE)(
    "writes an Excalidraw scene when --output ends in .excalidraw",
    async () => {
      const path = `${import.meta.dir}/../../node_modules/.cache/erd.excalidraw`;
      const stdout = captureOutput();
      const stderr = captureOutput();
      const code = await runCliWithParsedArgs(
        cli,
        [`--database=${testDatabaseUrl()}`, "--tables=users", `--output=${path}`],
        stdout,
        stderr,
      );

      expect(stderr.text()).toBe("");
      expect(code).toBe(0);
      const scene = (await Bun.file(path).json()) as {
        type: string;
        elements: { text?: string }[];
      };
      expect(scene.type).toBe("excalidraw");
      expect(scene.elements.map(e => e.text)).toContain("manager_id?");
    },
    30_000,
  );
});
