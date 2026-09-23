import { describe, expect, test } from "bun:test";

import { SQL } from "bun";

import { RunError } from "./errors.ts";
import { introspect } from "./introspect.ts";
import { NO_DATABASE, testDatabaseUrl } from "./test-helpers/test-database-url.ts";
import type { Schema, Table } from "./types.ts";

const introspectTestDatabase = async (schema: string, selected?: string[]): Promise<Schema> => {
  await using sql = new SQL(testDatabaseUrl());
  const result = await introspect(sql, schema, selected);
  return result;
};

const byName = (tables: Table[], name: string): Table => {
  const found = tables.find(t => t.name === name);
  if (!found) throw new Error(`no table ${name}`);
  return found;
};

describe.skipIf(NO_DATABASE)("introspect", () => {
  test("selects ordinary tables and partitioned parents only", async () => {
    const schema = await introspectTestDatabase("public");
    const names = schema.tables.map(t => t.name);
    expect(names).toContain("events");
    expect(names).not.toContain("events_2024");
    expect(names).not.toContain("user_names");
    expect(names).not.toContain("widgets");
  });

  test("honours --schema", async () => {
    const schema = await introspectTestDatabase("other");
    expect(schema.tables.map(t => t.name)).toEqual(["widgets"]);
  });

  test("errors on tables missing from the schema, naming all of them", async () => {
    const failure = introspectTestDatabase("public", ["users", "nope", "also_nope"]);
    await expect(failure).rejects.toThrow(RunError);
    await expect(failure).rejects.toThrow(/nope, also_nope/);
  });

  test("errors when a schema has no tables", async () => {
    await expect(introspectTestDatabase("pg_toast")).rejects.toThrow(/no tables found/);
  });

  test("reads nullability and both type spellings", async () => {
    const users = byName((await introspectTestDatabase("public", ["users"])).tables, "users");
    const columns = Object.fromEntries(users.columns.map(c => [c.name, c]));
    expect(columns.email!.nullable).toBe(false);
    expect(columns.nickname!.nullable).toBe(true);
    expect(columns.email!.baseType).toBe("varchar");
    expect(columns.email!.fullType).toBe("character varying(255)");
    expect(columns.balance!.fullType).toBe("numeric(10,2)");
    expect(columns.seen_at!.baseType).toBe("timestamptz");
    expect(columns.tags!.baseType).toBe("text[]");
  });

  test("badges primary, foreign and single-column unique constraints", async () => {
    const users = byName((await introspectTestDatabase("public", ["users"])).tables, "users");
    const columns = Object.fromEntries(users.columns.map(c => [c.name, c]));
    expect(columns.id!.isPrimaryKey).toBe(true);
    expect(columns.email!.isUnique).toBe(true);
    // From a bare CREATE UNIQUE INDEX, not a constraint.
    expect(columns.nickname!.isUnique).toBe(true);
    expect(columns.manager_id!.isForeignKey).toBe(true);
    expect(columns.balance!.isUnique).toBe(false);
  });

  test("does not badge members of a composite unique", async () => {
    const orders = byName((await introspectTestDatabase("public", ["orders"])).tables, "orders");
    const columns = Object.fromEntries(orders.columns.map(c => [c.name, c]));
    expect(columns.tenant_id!.isUnique).toBe(false);
    expect(columns.placed_at!.isUnique).toBe(false);
    expect(columns.id!.isPrimaryKey).toBe(true);
    expect(columns.tenant_id!.isPrimaryKey).toBe(true);
  });

  test("draws a self-referencing foreign key", async () => {
    const schema = await introspectTestDatabase("public", ["users"]);
    expect(schema.edges).toEqual([
      { table: "users", column: "manager_id", refTable: "users", refColumn: "id" },
    ]);
  });

  test("draws one edge for a composite foreign key, badging every member", async () => {
    const schema = await introspectTestDatabase("public", ["orders", "order_items"]);
    expect(schema.edges).toHaveLength(1);
    expect(schema.edges[0]).toEqual({
      table: "order_items",
      column: "order_id",
      refTable: "orders",
      refColumn: "id",
    });
    const items = byName(schema.tables, "order_items");
    const columns = Object.fromEntries(items.columns.map(c => [c.name, c]));
    expect(columns.order_id!.isForeignKey).toBe(true);
    expect(columns.tenant_id!.isForeignKey).toBe(true);
  });

  test("drops edges to unselected tables but keeps the badge", async () => {
    const schema = await introspectTestDatabase("public", ["order_items"]);
    expect(schema.edges).toHaveLength(0);
    const columns = byName(schema.tables, "order_items").columns;
    expect(columns.find(c => c.name === "order_id")!.isForeignKey).toBe(true);
  });
});
