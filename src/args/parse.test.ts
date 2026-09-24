import { describe, expect, test } from "bun:test";

import { HelpRequested, UsageError } from "../errors.ts";
import { parse } from "./parse.ts";

const NO_ENV: Record<string, string | undefined> = {};
const ENV = { DATABASE_URL: "postgres://env/db" };

describe("parse: connection", () => {
  test("accepts a postgres URL", () => {
    expect(parse(["--database=postgres://host/db"], NO_ENV).connectionString).toBe(
      "postgres://host/db",
    );
    expect(parse(["--database=postgresql://host/db"], NO_ENV).connectionString).toBe(
      "postgresql://host/db",
    );
  });

  test("rejects a bare database name", () => {
    expect(() => parse(["--database=mydb"], ENV)).toThrow(UsageError);
  });

  test("falls back to DATABASE_URL", () => {
    expect(parse([], ENV).connectionString).toBe("postgres://env/db");
  });

  test("--database wins over DATABASE_URL", () => {
    expect(parse(["--database=postgres://flag/db"], ENV).connectionString).toBe(
      "postgres://flag/db",
    );
  });

  test("errors with neither", () => {
    expect(() => parse([], NO_ENV)).toThrow(UsageError);
  });
});

describe("parse: selection", () => {
  test("defaults to every table in public", () => {
    const options = parse([], ENV);
    expect(options.tables).toBeUndefined();
    expect(options.schema).toBe("public");
  });

  test("splits and trims --tables", () => {
    expect(parse(["--tables=a, b ,c"], ENV).tables).toEqual(["a", "b", "c"]);
  });

  test("deduplicates --tables", () => {
    expect(parse(["--tables=a,b,a"], ENV).tables).toEqual(["a", "b"]);
  });

  test("rejects schema-qualified names", () => {
    expect(() => parse(["--tables=public.a"], ENV)).toThrow(/--schema/);
  });

  test("rejects an empty --tables", () => {
    expect(() => parse(["--tables=,,"], ENV)).toThrow(UsageError);
  });

  test("--tables and --database combine", () => {
    const options = parse(["--database=postgres://host/db", "--tables=a"], NO_ENV);
    expect(options.connectionString).toBe("postgres://host/db");
    expect(options.tables).toEqual(["a"]);
  });
});

describe("parse: type mode", () => {
  test("defaults to base", () => {
    expect(parse([], ENV).types).toBe("base");
  });

  test("--hide-types is an alias for none", () => {
    expect(parse(["--hide-types"], ENV).types).toBe("none");
  });

  test("accepts each level", () => {
    for (const mode of ["none", "base", "full"] as const) {
      expect(parse([`--types=${mode}`], ENV).types).toBe(mode);
    }
  });

  test("rejects an unknown level", () => {
    expect(() => parse(["--types=short"], ENV)).toThrow(UsageError);
  });

  test("rejects a contradictory pair", () => {
    expect(() => parse(["--hide-types", "--types=full"], ENV)).toThrow(UsageError);
    expect(parse(["--hide-types", "--types=none"], ENV).types).toBe("none");
  });
});

describe("parse: format", () => {
  test("defaults to d2", () => {
    expect(parse([], ENV).format).toBe("d2");
  });

  test("accepts each format", () => {
    for (const format of ["d2", "svg", "excalidraw"] as const) {
      expect(parse([`--format=${format}`], ENV).format).toBe(format);
    }
  });

  test("is implied by the --output extension, in any case", () => {
    expect(parse(["--output=erd.svg"], ENV).format).toBe("svg");
    expect(parse(["--output=ERD.SVG"], ENV).format).toBe("svg");
    expect(parse(["--output=erd.d2"], ENV).format).toBe("d2");
    expect(parse(["--output=docs/erd.excalidraw"], ENV).format).toBe("excalidraw");
  });

  test("falls back to d2 for an extension that implies nothing", () => {
    expect(parse(["--output=erd.txt"], ENV).format).toBe("d2");
    expect(parse(["--output=erd"], ENV).format).toBe("d2");
  });

  test("an explicit format goes with any extension that implies nothing", () => {
    expect(parse(["--format=svg", "--output=erd.txt"], ENV).format).toBe("svg");
    expect(parse(["--format=svg", "--output=erd.svg"], ENV).format).toBe("svg");
  });

  test("rejects a format the extension contradicts", () => {
    expect(() => parse(["--format=svg", "--output=erd.d2"], ENV)).toThrow(
      /--format=svg conflicts with --output=erd.d2/,
    );
    expect(() => parse(["--format=d2", "--output=erd.excalidraw"], ENV)).toThrow(UsageError);
  });

  test("rejects an unknown format", () => {
    expect(() => parse(["--format=png"], ENV)).toThrow(UsageError);
  });
});

describe("parse: layout", () => {
  test("is unset unless given, so D2 output names no engine", () => {
    expect(parse([], ENV).layout).toBeUndefined();
  });

  test("accepts each engine D2's WASM build has", () => {
    for (const layout of ["elk", "dagre"] as const) {
      expect(parse([`--layout=${layout}`], ENV).layout).toBe(layout);
    }
  });

  test("rejects any other engine, TALA included", () => {
    expect(() => parse(["--layout=tala"], ENV)).toThrow(
      /--layout must be one of elk, dagre, got 'tala'/,
    );
  });
});

describe("parse: other flags", () => {
  test("nullable markers are on unless opted out", () => {
    expect(parse([], ENV).nullableMarkers).toBe(true);
    expect(parse(["--no-nullable-markers"], ENV).nullableMarkers).toBe(false);
  });

  test("--exclude-fields is repeatable", () => {
    const options = parse(["--exclude-fields=updatedAt", "--exclude-fields=a\\.b"], ENV);
    expect(options.excludeFields!.map(String)).toEqual(["/updatedAt/", "/a\\.b/"]);
  });

  test("rejects an invalid regular expression", () => {
    expect(() => parse(["--exclude-fields=[unclosed"], ENV)).toThrow(UsageError);
  });

  test("--schema and --output pass through", () => {
    const options = parse(["--schema=sales", "--output=erd.d2"], ENV);
    expect(options.schema).toBe("sales");
    expect(options.output).toBe("erd.d2");
  });

  test("--help throws HelpRequested", () => {
    expect(() => parse(["--help"], NO_ENV)).toThrow(HelpRequested);
    expect(() => parse(["-h"], NO_ENV)).toThrow(HelpRequested);
  });

  test("rejects unknown flags and positionals", () => {
    expect(() => parse(["--nope"], ENV)).toThrow(UsageError);
    expect(() => parse(["stray"], ENV)).toThrow(UsageError);
  });
});
