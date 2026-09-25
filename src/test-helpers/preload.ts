import { afterAll, beforeAll } from "bun:test";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";

import { NO_DATABASE } from "./test-database-url.ts";

const TEST_SCHEMA_DDL = `
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

/**
 * One container for the whole run, with the schema applied once. Integration
 * tests read `TEST_DATABASE_URL`; unit tests never touch it.
 */
let container: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  if (NO_DATABASE) return;
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.TEST_DATABASE_URL = container.getConnectionUri();

  const sql = postgres(container.getConnectionUri());
  await sql.unsafe(TEST_SCHEMA_DDL);
  await sql.end();
}, 180_000);

afterAll(async () => {
  await container?.stop();
}, 60_000);
