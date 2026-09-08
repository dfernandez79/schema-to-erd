import { afterAll, beforeAll } from "bun:test";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

/**
 * One container for the whole run. Integration tests read
 * `TEST_DATABASE_URL`; unit tests never touch it.
 */
let container: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  if (process.env.SKIP_DB_TESTS === "1") return;
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.TEST_DATABASE_URL = container.getConnectionUri();
}, 180_000);

afterAll(async () => {
  await container?.stop();
}, 60_000);
