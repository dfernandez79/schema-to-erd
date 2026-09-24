import { beforeAll, describe, expect, test } from "bun:test";

import { renderSvg } from "./render-svg.ts";
import { column } from "./test-helpers/column.ts";
import { schemaOf } from "./test-helpers/schema-of.ts";
import { table } from "./test-helpers/table.ts";

/** Loading D2's WASM takes a second or two, past bun's default timeout. */
const WASM_TIMEOUT = 30_000;

const SCHEMA = schemaOf(
  [
    table("orders", [
      column("id", { baseType: "uuid", isPrimaryKey: true }),
      column("user_id", { baseType: "uuid", isForeignKey: true, nullable: true }),
    ]),
    table("users", [column("id", { baseType: "uuid", isPrimaryKey: true })]),
  ],
  [{ table: "orders", column: "user_id", refTable: "users", refColumn: "id" }],
);

const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]!);

/** The path of each foreign key arrow. */
const arrows = (svg: string): string[] =>
  [...svg.matchAll(/<path d="([^"]*)"[^>]*class="connection stroke-/g)].map(match => match[1]!);

describe("renderSvg", () => {
  let svg = "";

  beforeAll(async () => {
    svg = await renderSvg(SCHEMA, { types: "base", nullableMarkers: true });
  }, WASM_TIMEOUT);

  test("emits a standalone SVG document", () => {
    expect(svg).toStartWith("<?xml");
    expect(svg).toContain("<svg");
    expect(svg.trimEnd()).toEndWith("</svg>");
  });

  test("draws every table, column, type and constraint once", () => {
    expect(texts(svg).toSorted()).toEqual(
      [
        "orders",
        "id",
        "uuid",
        "PK",
        "user_id?",
        "uuid",
        "FK",
        "users",
        "id",
        "uuid",
        "PK",
      ].toSorted(),
    );
  });

  test("draws one arrow per foreign key", () => {
    expect(arrows(svg)).toHaveLength(1);
  });

  test(
    "lays out with ELK unless told otherwise, and with dagre when told",
    async () => {
      const [elk, dagre] = await Promise.all([
        renderSvg(SCHEMA, { types: "base", nullableMarkers: true, layout: "elk" }),
        renderSvg(SCHEMA, { types: "base", nullableMarkers: true, layout: "dagre" }),
      ]);
      expect(arrows(svg)).toEqual(arrows(elk));
      // ELK draws right angles with rounded corners; dagre, Bézier curves.
      expect(arrows(elk)[0]).not.toContain(" C ");
      expect(arrows(dagre)[0]).toContain(" C ");
    },
    WASM_TIMEOUT,
  );

  test(
    "renders the same schema to the same bytes",
    async () => {
      expect(await renderSvg(SCHEMA, { types: "base", nullableMarkers: true })).toBe(svg);
    },
    WASM_TIMEOUT,
  );
});
