import { describe, expect, test } from "bun:test";

import { excludeFields } from "./exclude-fields.ts";
import { column } from "./test-helpers/column.ts";
import { schemaOf } from "./test-helpers/schema-of.ts";
import { table } from "./test-helpers/table.ts";

const sample = () =>
  schemaOf(
    [
      table("orders", [
        column("id", { isPrimaryKey: true }),
        column("updatedAt"),
        column("user_id", { isForeignKey: true }),
        column("total"),
      ]),
      table("users", [column("id", { isPrimaryKey: true }), column("updatedAt")]),
    ],
    [{ table: "orders", column: "user_id", refTable: "users", refColumn: "id" }],
  );

describe("excludeFields", () => {
  test("orders tables alphabetically and columns key-first", () => {
    const result = excludeFields(
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
    expect(result.tables.map(t => t.name)).toEqual(["a", "b"]);
    expect(result.tables[0]!.columns.map(c => c.name)).toEqual(["pk", "fk", "alpha", "zeta"]);
  });

  test("keeps composite primary keys in declared order", () => {
    const result = excludeFields(
      schemaOf([
        table("t", [
          column("b_id", { isPrimaryKey: true }),
          column("a_id", { isPrimaryKey: true }),
        ]),
      ]),
      [],
    );
    expect(result.tables[0]!.columns.map(c => c.name)).toEqual(["b_id", "a_id"]);
  });

  test("an unanchored pattern excludes the field from every table", () => {
    const result = excludeFields(sample(), [/updatedAt/]);
    for (const t of result.tables) {
      expect(t.columns.map(c => c.name)).not.toContain("updatedAt");
    }
    expect(result.tables[1]!.columns.map(c => c.name)).toEqual(["id"]);
  });

  test("a table-qualified pattern excludes only that table's field", () => {
    const result = excludeFields(sample(), [/orders\.updatedAt/]);
    expect(result.tables[0]!.columns.map(c => c.name)).not.toContain("updatedAt");
    expect(result.tables[1]!.columns.map(c => c.name)).toContain("updatedAt");
  });

  test("matching is case-sensitive", () => {
    const result = excludeFields(sample(), [/updatedat/]);
    expect(result.tables[1]!.columns.map(c => c.name)).toContain("updatedAt");
  });

  test("excluding a foreign key column drops its edge", () => {
    expect(excludeFields(sample(), []).edges).toHaveLength(1);
    expect(excludeFields(sample(), [/orders\.user_id/]).edges).toHaveLength(0);
  });
});
