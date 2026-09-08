import { describe, expect, test } from "bun:test";
import { HelpRequested, UsageError, parseOptions } from "../src/args.ts";

const NO_ENV: Record<string, string | undefined> = {};
const ENV = { DATABASE_URL: "postgres://env/db" };

describe("connection", () => {
  test("accepts a postgres URL", () => {
    expect(parseOptions(["--database=postgres://host/db"], NO_ENV).connectionString).toBe(
      "postgres://host/db",
    );
    expect(parseOptions(["--database=postgresql://host/db"], NO_ENV).connectionString).toBe(
      "postgresql://host/db",
    );
  });

  test("rejects a bare database name", () => {
    expect(() => parseOptions(["--database=mydb"], ENV)).toThrow(UsageError);
  });

  test("falls back to DATABASE_URL", () => {
    expect(parseOptions([], ENV).connectionString).toBe("postgres://env/db");
  });

  test("--database wins over DATABASE_URL", () => {
    expect(parseOptions(["--database=postgres://flag/db"], ENV).connectionString).toBe(
      "postgres://flag/db",
    );
  });

  test("errors with neither", () => {
    expect(() => parseOptions([], NO_ENV)).toThrow(UsageError);
  });
});

describe("selection", () => {
  test("defaults to every table in public", () => {
    const options = parseOptions([], ENV);
    expect(options.tables).toBeNull();
    expect(options.schema).toBe("public");
  });

  test("splits and trims --tables", () => {
    expect(parseOptions(["--tables=a, b ,c"], ENV).tables).toEqual(["a", "b", "c"]);
  });

  test("deduplicates --tables", () => {
    expect(parseOptions(["--tables=a,b,a"], ENV).tables).toEqual(["a", "b"]);
  });

  test("rejects schema-qualified names", () => {
    expect(() => parseOptions(["--tables=public.a"], ENV)).toThrow(/--schema/);
  });

  test("rejects an empty --tables", () => {
    expect(() => parseOptions(["--tables=,,"], ENV)).toThrow(UsageError);
  });

  test("--tables and --database combine", () => {
    const options = parseOptions(["--database=postgres://host/db", "--tables=a"], NO_ENV);
    expect(options.connectionString).toBe("postgres://host/db");
    expect(options.tables).toEqual(["a"]);
  });
});

describe("type mode", () => {
  test("defaults to base", () => {
    expect(parseOptions([], ENV).types).toBe("base");
  });

  test("--hide-types is an alias for none", () => {
    expect(parseOptions(["--hide-types"], ENV).types).toBe("none");
  });

  test("accepts each level", () => {
    for (const mode of ["none", "base", "full"] as const) {
      expect(parseOptions([`--types=${mode}`], ENV).types).toBe(mode);
    }
  });

  test("rejects an unknown level", () => {
    expect(() => parseOptions(["--types=short"], ENV)).toThrow(UsageError);
  });

  test("rejects a contradictory pair", () => {
    expect(() => parseOptions(["--hide-types", "--types=full"], ENV)).toThrow(UsageError);
    expect(parseOptions(["--hide-types", "--types=none"], ENV).types).toBe("none");
  });
});

describe("other flags", () => {
  test("nullable markers are on unless opted out", () => {
    expect(parseOptions([], ENV).nullableMarkers).toBe(true);
    expect(parseOptions(["--no-nullable-markers"], ENV).nullableMarkers).toBe(false);
  });

  test("--exclude-fields is repeatable", () => {
    const options = parseOptions(
      ["--exclude-fields=updatedAt", "--exclude-fields=a\\.b"],
      ENV,
    );
    expect(options.excludeFields.map(String)).toEqual(["/updatedAt/", "/a\\.b/"]);
  });

  test("rejects an invalid regular expression", () => {
    expect(() => parseOptions(["--exclude-fields=[unclosed"], ENV)).toThrow(UsageError);
  });

  test("--schema and --output pass through", () => {
    const options = parseOptions(["--schema=sales", "--output=erd.d2"], ENV);
    expect(options.schema).toBe("sales");
    expect(options.output).toBe("erd.d2");
  });

  test("--help throws HelpRequested", () => {
    expect(() => parseOptions(["--help"], NO_ENV)).toThrow(HelpRequested);
    expect(() => parseOptions(["-h"], NO_ENV)).toThrow(HelpRequested);
  });

  test("rejects unknown flags and positionals", () => {
    expect(() => parseOptions(["--nope"], ENV)).toThrow(UsageError);
    expect(() => parseOptions(["stray"], ENV)).toThrow(UsageError);
  });
});
