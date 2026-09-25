import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { HELP } from "./args/help.ts";
import { runCliWithParsedArgs } from "./args/run-cli-with-parsed-args.ts";
import { cli } from "./cli.ts";
import { captureOutput } from "./test-helpers/capture-output.ts";
import { NO_DATABASE, testDatabaseUrl } from "./test-helpers/test-database-url.ts";
import type { Format } from "./types.ts";

type Run = { code: number; stdout: string; stderr: string };

const ROOT = join(import.meta.dir, "..");

const FORMATS: Format[] = ["d2", "svg", "excalidraw"];

/** What a pipe holds on Linux, and so the most one write to it takes at once. */
const PIPE_CAPACITY = 64 * 1024;

/** Runs a command to its end, collecting what it writes. */
const run = async (command: string[], cwd?: string): Promise<Run> => {
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    proc.stdout.text(),
    proc.stderr.text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
};

/**
 * Node.js from the PATH, unless it's the `node` that `bun run` puts there
 * when Node.js isn't installed, which is Bun.
 */
const findNode = (): string | undefined => {
  const node = Bun.which("node");
  if (node === null) return undefined;
  const probe = Bun.spawnSync([node, "--print", "typeof Bun"]);
  return probe.stdout.toString().trim() === "undefined" ? node : undefined;
};

const NODE = findNode();

/** Runs the command in-process on Bun, as the other tests do. */
const onBun = async (args: string[]): Promise<Run> => {
  const stdout = captureOutput();
  const stderr = captureOutput();
  const code = await runCliWithParsedArgs(cli, args, stdout, stderr);
  return { code, stdout: stdout.text(), stderr: stderr.text() };
};

describe.skipIf(NODE === undefined)("the packed binary, on Node", () => {
  let dir = "";
  let bin = "";

  const onNode = (args: string[]): Promise<Run> => run([NODE!, bin, ...args]);

  // Unpacks the package where npm would install it, with only the
  // dependencies it declares linked in from this checkout.
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "schema-to-erd-"));
    const tarball = join(dir, "package.tgz");
    // Packing runs the prepack script, which builds with bunup.
    const pack = await run([process.execPath, "pm", "pack", "--filename", tarball], ROOT);
    if (pack.code !== 0) throw new Error(`bun pm pack failed:\n${pack.stderr}`);
    await new Bun.Archive(await Bun.file(tarball).bytes()).extract(dir);

    const root = join(dir, "package");
    const manifest = (await Bun.file(join(root, "package.json")).json()) as {
      bin: Record<string, string>;
      dependencies: Record<string, string>;
    };
    for (const name of Object.keys(manifest.dependencies)) {
      const link = join(root, "node_modules", name);
      await mkdir(dirname(link), { recursive: true });
      await symlink(join(ROOT, "node_modules", name), link);
    }
    bin = join(root, manifest.bin["schema-to-erd"]!);
  }, 60_000);

  afterAll(() => rm(dir, { recursive: true, force: true }));

  test("has a shebang that runs it on Node", async () => {
    const [shebang] = (await Bun.file(bin).text()).split("\n", 1);
    expect(shebang).toBe("#!/usr/bin/env node");
  });

  test("prints the help and exits 0", async () => {
    expect(await onNode(["--help"])).toEqual({ code: 0, stdout: HELP, stderr: "" });
  });

  test("reports a usage error and exits 2", async () => {
    const { code, stdout, stderr } = await onNode(["--nope"]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toStartWith("schema-to-erd: ");
    expect(stderr).toEndWith(HELP);
  });

  test("reports an unreachable database and exits 1", async () => {
    const { code, stdout, stderr } = await onNode(["--database=postgres://127.0.0.1:1/nope"]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toStartWith("schema-to-erd: ");
    expect(stderr).toContain("ECONNREFUSED");
  });

  describe.skipIf(NO_DATABASE)("with a database", () => {
    test.each(FORMATS)(
      "renders %s as it does on Bun",
      async format => {
        const args = [`--database=${testDatabaseUrl()}`, `--format=${format}`];
        const expected = await onBun(args);
        expect(expected.code).toBe(0);
        expect(await onNode(args)).toEqual(expected);
      },
      30_000,
    );

    // Bun.spawn's stdout is a socket, with room to spare; a shell's is a pipe.
    // With its reader lagging, the scene can't all go in one write, and
    // process.exit() would cut it off where that write ended.
    test("pipes out a scene bigger than the pipe holds whole", async () => {
      const args = [`--database=${testDatabaseUrl()}`, "--format=excalidraw"];
      const expected = (await onBun(args)).stdout;
      expect(expected.length).toBeGreaterThan(PIPE_CAPACITY);
      const lagging = '"$@" | { sleep 2; cat; }';
      expect((await run(["sh", "-c", lagging, "sh", NODE!, bin, ...args])).stdout).toBe(expected);
    }, 30_000);

    test("writes --output to a file", async () => {
      const path = join(dir, "erd.d2");
      const args = [`--database=${testDatabaseUrl()}`, "--tables=users"];
      expect(await onNode([...args, `--output=${path}`])).toEqual({
        code: 0,
        stdout: "",
        stderr: "",
      });
      expect(await readFile(path, "utf8")).toBe((await onBun(args)).stdout);
    });
  });
});
