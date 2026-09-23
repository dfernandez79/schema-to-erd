import { describe, expect, test } from "bun:test";

import { shortenSqlType } from "./shorten-sql-type.ts";

describe("shortenSqlType", () => {
  test("shortens verbose SQL-standard spellings", () => {
    expect(shortenSqlType("character varying")).toBe("varchar");
    expect(shortenSqlType("timestamp with time zone")).toBe("timestamptz");
    expect(shortenSqlType("timestamp without time zone")).toBe("timestamp");
    expect(shortenSqlType("double precision")).toBe("float8");
  });

  test("leaves already-short types alone", () => {
    expect(shortenSqlType("integer")).toBe("integer");
    expect(shortenSqlType("jsonb")).toBe("jsonb");
    expect(shortenSqlType("numeric")).toBe("numeric");
  });

  test("preserves array suffixes", () => {
    expect(shortenSqlType("character varying[]")).toBe("varchar[]");
    expect(shortenSqlType("integer[][]")).toBe("integer[][]");
  });
});
