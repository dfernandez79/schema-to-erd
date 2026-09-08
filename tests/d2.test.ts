import { describe, expect, test } from "bun:test";
import { renderD2 } from "../src/d2.ts";
import { prepare } from "../src/filter.ts";
import { shortenType } from "../src/introspect.ts";
import { column, schemaOf, table } from "./fixtures.ts";

const BASE = { types: "base", nullableMarkers: true } as const;

describe("renderD2", () => {
  test("renders a table with constraints and types", () => {
    const output = renderD2(
      schemaOf([
        table("users", [
          column("id", { baseType: "uuid", fullType: "uuid", isPrimaryKey: true }),
          column("email", { baseType: "varchar", fullType: "character varying(255)", isUnique: true }),
          column("bio", { nullable: true }),
        ]),
      ]),
      BASE,
    );
    expect(output).toBe(
      `"users": {
  shape: sql_table
  "id": "uuid" {constraint: primary_key}
  "email": "varchar" {constraint: unique}
  "bio?": "text"
}
`,
    );
  });

  test("combines multiple constraints into an array", () => {
    const output = renderD2(
      schemaOf([table("t", [column("x", { isForeignKey: true, isUnique: true })])]),
      BASE,
    );
    expect(output).toContain(`"x": "text" {constraint: [foreign_key; unique]}`);
  });

  test("--types=none keeps constraints and nullable markers", () => {
    const output = renderD2(
      schemaOf([
        table("t", [
          column("id", { isPrimaryKey: true }),
          column("note", { nullable: true }),
        ]),
      ]),
      { types: "none", nullableMarkers: true },
    );
    expect(output).toBe(
      `"t": {
  shape: sql_table
  "id" {constraint: primary_key}
  "note?"
}
`,
    );
  });

  test("--types=full uses the raw format_type output", () => {
    const output = renderD2(
      schemaOf([table("t", [column("x", { baseType: "numeric", fullType: "numeric(10,2)" })])]),
      { types: "full", nullableMarkers: true },
    );
    expect(output).toContain(`"x": "numeric(10,2)"`);
  });

  test("--no-nullable-markers drops the question mark", () => {
    const output = renderD2(
      schemaOf([table("t", [column("note", { nullable: true })])]),
      { types: "base", nullableMarkers: false },
    );
    expect(output).toContain(`"note": "text"`);
    expect(output).not.toContain("?");
  });

  test("renders edges after the tables", () => {
    const output = renderD2(
      schemaOf(
        [
          table("orders", [column("user_id", { isForeignKey: true })]),
          table("users", [column("id", { isPrimaryKey: true })]),
        ],
        [{ table: "orders", column: "user_id", refTable: "users", refColumn: "id" }],
      ),
      BASE,
    );
    expect(output.trimEnd().endsWith(`"orders"."user_id" -> "users"."id"`)).toBe(true);
  });

  test("quotes identifiers that collide with D2 keywords", () => {
    const output = renderD2(
      schemaOf([table("shape", [column("style"), column("width"), column("label")])]),
      BASE,
    );
    expect(output).toContain(`"shape": {`);
    expect(output).toContain(`"style": "text"`);
    expect(output).toContain(`"width": "text"`);
  });

  test("escapes quotes and backslashes in identifiers", () => {
    const output = renderD2(schemaOf([table('we"ird', [column("back\\slash")])]), BASE);
    expect(output).toContain('"we\\"ird": {');
    expect(output).toContain('"back\\\\slash"');
  });
});

describe("prepare", () => {
  const sample = () =>
    schemaOf(
      [
        table("orders", [
          column("id", { isPrimaryKey: true }),
          column("updatedAt"),
          column("user_id", { isForeignKey: true }),
          column("total"),
        ]),
        table("users", [
          column("id", { isPrimaryKey: true }),
          column("updatedAt"),
        ]),
      ],
      [{ table: "orders", column: "user_id", refTable: "users", refColumn: "id" }],
    );

  test("orders tables alphabetically and columns key-first", () => {
    const result = prepare(
      schemaOf([
        table("b", []),
        table("a", [
          column("zeta"),
          column("alpha"),
          column("fk", { isForeignKey: true }),
          column("pk", { isPrimaryKey: true }),
        ]),
      ]),
      [],
    );
    expect(result.tables.map((t) => t.name)).toEqual(["a", "b"]);
    expect(result.tables[0]!.columns.map((c) => c.name)).toEqual([
      "pk",
      "fk",
      "alpha",
      "zeta",
    ]);
  });

  test("keeps composite primary keys in declared order", () => {
    const result = prepare(
      schemaOf([
        table("t", [
          column("b_id", { isPrimaryKey: true }),
          column("a_id", { isPrimaryKey: true }),
        ]),
      ]),
      [],
    );
    expect(result.tables[0]!.columns.map((c) => c.name)).toEqual(["b_id", "a_id"]);
  });

  test("an unanchored pattern excludes the field from every table", () => {
    const result = prepare(sample(), [/updatedAt/]);
    for (const t of result.tables) {
      expect(t.columns.map((c) => c.name)).not.toContain("updatedAt");
    }
    expect(result.tables[1]!.columns.map((c) => c.name)).toEqual(["id"]);
  });

  test("a table-qualified pattern excludes only that table's field", () => {
    const result = prepare(sample(), [/orders\.updatedAt/]);
    expect(result.tables[0]!.columns.map((c) => c.name)).not.toContain("updatedAt");
    expect(result.tables[1]!.columns.map((c) => c.name)).toContain("updatedAt");
  });

  test("matching is case-sensitive", () => {
    const result = prepare(sample(), [/updatedat/]);
    expect(result.tables[1]!.columns.map((c) => c.name)).toContain("updatedAt");
  });

  test("excluding a foreign key column drops its edge", () => {
    expect(prepare(sample(), []).edges).toHaveLength(1);
    expect(prepare(sample(), [/orders\.user_id/]).edges).toHaveLength(0);
  });
});

describe("shortenType", () => {
  test("shortens verbose SQL-standard spellings", () => {
    expect(shortenType("character varying")).toBe("varchar");
    expect(shortenType("timestamp with time zone")).toBe("timestamptz");
    expect(shortenType("timestamp without time zone")).toBe("timestamp");
    expect(shortenType("double precision")).toBe("float8");
  });

  test("leaves already-short types alone", () => {
    expect(shortenType("integer")).toBe("integer");
    expect(shortenType("jsonb")).toBe("jsonb");
    expect(shortenType("numeric")).toBe("numeric");
  });

  test("preserves array suffixes", () => {
    expect(shortenType("character varying[]")).toBe("varchar[]");
    expect(shortenType("integer[][]")).toBe("integer[][]");
  });
});

describe("primary keys imply uniqueness", () => {
  test("does not badge a primary key as unique as well", () => {
    const output = renderD2(
      schemaOf([table("t", [column("id", { isPrimaryKey: true, isUnique: true })])]),
      BASE,
    );
    expect(output).toContain(`"id": "text" {constraint: primary_key}`);
  });
});
