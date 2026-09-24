import { describe, expect, test } from "bun:test";

import { renderD2 } from "./render-d2.ts";
import { column } from "./test-helpers/column.ts";
import { schemaOf } from "./test-helpers/schema-of.ts";
import { table } from "./test-helpers/table.ts";

const BASE = { types: "base", nullableMarkers: true } as const;

describe("renderD2", () => {
  test("renders a table with constraints and types", () => {
    const output = renderD2(
      schemaOf([
        table("users", [
          column("id", { baseType: "uuid", fullType: "uuid", isPrimaryKey: true }),
          column("email", {
            baseType: "varchar",
            fullType: "character varying(255)",
            isUnique: true,
          }),
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

  test("does not badge a primary key as unique as well", () => {
    const output = renderD2(
      schemaOf([table("t", [column("id", { isPrimaryKey: true, isUnique: true })])]),
      BASE,
    );
    expect(output).toContain(`"id": "text" {constraint: primary_key}`);
  });

  test("--types=none keeps constraints and nullable markers", () => {
    const output = renderD2(
      schemaOf([
        table("t", [column("id", { isPrimaryKey: true }), column("note", { nullable: true })]),
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
    const output = renderD2(schemaOf([table("t", [column("note", { nullable: true })])]), {
      types: "base",
      nullableMarkers: false,
    });
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

  test("edges name a nullable column with its marker, so D2 adds no stray row", () => {
    const schema = schemaOf(
      [
        table("orders", [column("user_id", { isForeignKey: true, nullable: true })]),
        table("users", [column("id", { isPrimaryKey: true })]),
      ],
      [{ table: "orders", column: "user_id", refTable: "users", refColumn: "id" }],
    );
    expect(renderD2(schema, BASE)).toContain(`"orders"."user_id?" -> "users"."id"`);
    expect(renderD2(schema, { types: "base", nullableMarkers: false })).toContain(
      `"orders"."user_id" -> "users"."id"`,
    );
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
