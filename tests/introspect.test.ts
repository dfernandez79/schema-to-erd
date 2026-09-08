import { SQL } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import { RunError } from "../src/args.ts";
import { run } from "../src/cli.ts";
import { renderD2 } from "../src/d2.ts";
import { prepare } from "../src/filter.ts";
import { introspect } from "../src/introspect.ts";
import type { Table } from "../src/types.ts";

const DDL = `
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  nickname text,
  tags text[],
  balance numeric(10,2) NOT NULL,
  seen_at timestamptz,
  manager_id uuid REFERENCES users (id)
);

CREATE UNIQUE INDEX users_nickname_key ON users (nickname);

CREATE TABLE orders (
  id uuid,
  tenant_id uuid,
  placed_at timestamp NOT NULL,
  PRIMARY KEY (id, tenant_id),
  UNIQUE (tenant_id, placed_at)
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id)
);

-- Column names that are D2 keywords.
CREATE TABLE shape (
  id int PRIMARY KEY,
  style text,
  width int,
  label text,
  "near" text
);

CREATE TABLE events (
  id bigint NOT NULL,
  at date NOT NULL
) PARTITION BY RANGE (at);
CREATE TABLE events_2024 PARTITION OF events FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE VIEW user_names AS SELECT id, email FROM users;

CREATE SCHEMA other;
CREATE TABLE other.widgets (id int PRIMARY KEY);
`;

/** Set to 1 to run only the unit tests, without Docker. */
const noDatabase = process.env.SKIP_DB_TESTS === "1";
let url: string;

beforeAll(async () => {
  if (noDatabase) return;
  url = process.env.TEST_DATABASE_URL ?? "";
  if (url === "") throw new Error("TEST_DATABASE_URL not set; is Docker running?");
  const sql = new SQL(url);
  await sql.unsafe(DDL);
  await sql.close();
});

function byName(tables: Table[], name: string): Table {
  const found = tables.find((t) => t.name === name);
  if (!found) throw new Error(`no table ${name}`);
  return found;
}

describe.skipIf(noDatabase)("introspect", () => {
  test("selects ordinary tables and partitioned parents only", async () => {
    const schema = await introspect(url, "public", null);
    const names = schema.tables.map((t) => t.name);
    expect(names).toContain("events");
    expect(names).not.toContain("events_2024");
    expect(names).not.toContain("user_names");
    expect(names).not.toContain("widgets");
  });

  test("honours --schema", async () => {
    const schema = await introspect(url, "other", null);
    expect(schema.tables.map((t) => t.name)).toEqual(["widgets"]);
  });

  test("errors on tables missing from the schema, naming all of them", async () => {
    const failure = introspect(url, "public", ["users", "nope", "also_nope"]);
    await expect(failure).rejects.toThrow(RunError);
    await expect(failure).rejects.toThrow(/nope, also_nope/);
  });

  test("errors when a schema has no tables", async () => {
    await expect(introspect(url, "pg_toast", null)).rejects.toThrow(/no tables found/);
  });

  test("reads nullability and both type spellings", async () => {
    const users = byName((await introspect(url, "public", ["users"])).tables, "users");
    const columns = Object.fromEntries(users.columns.map((c) => [c.name, c]));
    expect(columns.email!.nullable).toBe(false);
    expect(columns.nickname!.nullable).toBe(true);
    expect(columns.email!.baseType).toBe("varchar");
    expect(columns.email!.fullType).toBe("character varying(255)");
    expect(columns.balance!.fullType).toBe("numeric(10,2)");
    expect(columns.seen_at!.baseType).toBe("timestamptz");
    expect(columns.tags!.baseType).toBe("text[]");
  });

  test("badges primary, foreign and single-column unique constraints", async () => {
    const users = byName((await introspect(url, "public", ["users"])).tables, "users");
    const columns = Object.fromEntries(users.columns.map((c) => [c.name, c]));
    expect(columns.id!.isPrimaryKey).toBe(true);
    expect(columns.email!.isUnique).toBe(true);
    // From a bare CREATE UNIQUE INDEX, not a constraint.
    expect(columns.nickname!.isUnique).toBe(true);
    expect(columns.manager_id!.isForeignKey).toBe(true);
    expect(columns.balance!.isUnique).toBe(false);
  });

  test("does not badge members of a composite unique", async () => {
    const orders = byName((await introspect(url, "public", ["orders"])).tables, "orders");
    const columns = Object.fromEntries(orders.columns.map((c) => [c.name, c]));
    expect(columns.tenant_id!.isUnique).toBe(false);
    expect(columns.placed_at!.isUnique).toBe(false);
    expect(columns.id!.isPrimaryKey).toBe(true);
    expect(columns.tenant_id!.isPrimaryKey).toBe(true);
  });

  test("draws a self-referencing foreign key", async () => {
    const schema = await introspect(url, "public", ["users"]);
    expect(schema.edges).toEqual([
      { table: "users", column: "manager_id", refTable: "users", refColumn: "id" },
    ]);
  });

  test("draws one edge for a composite foreign key, badging every member", async () => {
    const schema = await introspect(url, "public", ["orders", "order_items"]);
    expect(schema.edges).toHaveLength(1);
    expect(schema.edges[0]).toEqual({
      table: "order_items",
      column: "order_id",
      refTable: "orders",
      refColumn: "id",
    });
    const items = byName(schema.tables, "order_items");
    const columns = Object.fromEntries(items.columns.map((c) => [c.name, c]));
    expect(columns.order_id!.isForeignKey).toBe(true);
    expect(columns.tenant_id!.isForeignKey).toBe(true);
  });

  test("drops edges to unselected tables but keeps the badge", async () => {
    const schema = await introspect(url, "public", ["order_items"]);
    expect(schema.edges).toHaveLength(0);
    const columns = byName(schema.tables, "order_items").columns;
    expect(columns.find((c) => c.name === "order_id")!.isForeignKey).toBe(true);
  });
});

describe.skipIf(noDatabase)("end to end", () => {
  test("emits D2 the d2 compiler accepts, keyword column names included", async () => {
    const output = await run(["--database=" + url], {});
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

  test("applies exclusions and type mode from the command line", async () => {
    const output = await run(
      [
        `--database=${url}`,
        "--tables=users",
        "--types=none",
        "--exclude-fields=users\\.nickname",
      ],
      {},
    );
    expect(output).not.toContain("nickname");
    expect(output).not.toContain("varchar");
    expect(output).toContain(`"seen_at?"`);
    expect(output).toContain(`"id" {constraint: primary_key}`);
  });

  test("is deterministic across runs", async () => {
    const args = [`--database=${url}`];
    expect(await run(args, {})).toBe(await run(args, {}));
  });

  test("prepare orders columns key-first in real output", async () => {
    const schema = prepare(await introspect(url, "public", ["users"]), []);
    const names = byName(schema.tables, "users").columns.map((c) => c.name);
    expect(names[0]).toBe("id");
    expect(names[1]).toBe("manager_id");
    expect(names.slice(2)).toEqual([...names.slice(2)].sort());
  });

  test("renderD2 output stays stable for a known table", async () => {
    const schema = prepare(await introspect(url, "public", ["order_items"]), []);
    expect(renderD2(schema, { types: "base", nullableMarkers: true })).toBe(
      `"order_items": {
  shape: sql_table
  "id": "uuid" {constraint: primary_key}
  "order_id": "uuid" {constraint: foreign_key}
  "tenant_id": "uuid" {constraint: foreign_key}
}
`,
    );
  });
});
