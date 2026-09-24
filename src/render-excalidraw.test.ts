import { beforeAll, describe, expect, test } from "bun:test";

import type { RenderOptions } from "./render-d2.ts";
import { renderExcalidraw } from "./render-excalidraw.ts";
import { column } from "./test-helpers/column.ts";
import { schemaOf } from "./test-helpers/schema-of.ts";
import { table } from "./test-helpers/table.ts";
import type { Schema } from "./types.ts";

/** Loading D2's WASM takes a second or two, past bun's default timeout. */
const WASM_TIMEOUT = 30_000;

const BASE: RenderOptions = { types: "base", nullableMarkers: true };

type Binding = { elementId: string; gap: number; fixedPoint: [number, number] };

type SceneElement = {
  id: string;
  type: "rectangle" | "text" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  groupIds: string[];
  strokeColor: string;
  backgroundColor: string;
  boundElements: { id: string; type: string }[] | null;
  text?: string;
  textAlign?: string;
  points?: [number, number][];
  startBinding?: Binding;
  endBinding?: Binding;
  elbowed?: boolean;
  endArrowhead?: string;
};

type Scene = {
  type: string;
  version: number;
  elements: SceneElement[];
  files: object;
};

const SCHEMA = schemaOf(
  [
    table("orders", [
      column("id", { baseType: "uuid", isPrimaryKey: true }),
      column("user_id", { baseType: "uuid", isForeignKey: true, nullable: true }),
      column("placed_at", { baseType: "timestamptz" }),
    ]),
    table("users", [
      column("id", { baseType: "uuid", isPrimaryKey: true }),
      column("manager_id", { baseType: "uuid", isForeignKey: true, nullable: true }),
      column("email", { baseType: "varchar", isUnique: true }),
    ]),
  ],
  [
    { table: "orders", column: "user_id", refTable: "users", refColumn: "id" },
    { table: "users", column: "manager_id", refTable: "users", refColumn: "id" },
  ],
);

const render = async (schema: Schema, options = BASE): Promise<Scene> =>
  JSON.parse(await renderExcalidraw(schema, options)) as Scene;

/** Everything drawn for a table, found through the group its title is in. */
const tableElements = (scene: Scene, name: string): SceneElement[] => {
  const title = scene.elements.find(e => e.type === "text" && e.text === name);
  if (!title) throw new Error(`no table titled ${name}`);
  return scene.elements.filter(e => e.groupIds[0] === title.groupIds[0]);
};

const outlineOf = (scene: Scene, name: string): SceneElement => {
  const [outline] = tableElements(scene, name);
  if (!outline) throw new Error(`no outline for ${name}`);
  return outline;
};

/** The invisible rectangle behind the row whose name reads `label`. */
const rowOf = (scene: Scene, name: string, label: string): SceneElement => {
  const elements = tableElements(scene, name);
  const text = elements.find(e => e.type === "text" && e.text === label);
  if (!text) throw new Error(`no row ${label} in ${name}`);
  const middle = text.y + text.height / 2;
  const row = elements.find(
    e => e.strokeColor === "transparent" && e.y < middle && middle < e.y + e.height,
  );
  if (!row) throw new Error(`no row behind ${label} in ${name}`);
  return row;
};

const arrowsOf = (scene: Scene): SceneElement[] => scene.elements.filter(e => e.type === "arrow");

const arrowFrom = (scene: Scene, row: SceneElement): SceneElement => {
  const arrow = arrowsOf(scene).find(a => a.startBinding?.elementId === row.id);
  if (!arrow) throw new Error(`no arrow from ${row.id}`);
  return arrow;
};

const ends = (arrow: SceneElement): [[number, number], [number, number]] => {
  const points = arrow.points ?? [];
  const [fx, fy] = points[0] ?? [0, 0];
  const [lx, ly] = points.at(-1) ?? [0, 0];
  return [
    [arrow.x + fx, arrow.y + fy],
    [arrow.x + lx, arrow.y + ly],
  ];
};

describe("renderExcalidraw", () => {
  let json = "";
  let scene: Scene;

  beforeAll(async () => {
    json = await renderExcalidraw(SCHEMA, BASE);
    scene = JSON.parse(json) as Scene;
  }, WASM_TIMEOUT);

  test("writes an Excalidraw scene file", () => {
    expect(scene.type).toBe("excalidraw");
    expect(scene.version).toBe(2);
    expect(scene.files).toEqual({});
    expect(json).toEndWith("}\n");
  });

  test("draws a table as one group: outline, filled header, and a line per column", () => {
    const elements = tableElements(scene, "users");
    const rectangles = elements.filter(e => e.type === "rectangle");
    expect(rectangles[0]!.backgroundColor).toBe("transparent");
    expect(rectangles[1]!.backgroundColor).not.toBe("transparent");
    expect(rectangles[1]!.height).toBe(rectangles[2]!.height);
    expect(
      elements
        .filter(e => e.type === "text")
        .map(e => e.text)
        .toSorted(),
    ).toEqual(
      [
        "users",
        "id",
        "uuid",
        "PK",
        "manager_id?",
        "uuid",
        "FK",
        "email",
        "varchar",
        "UNQ",
      ].toSorted(),
    );
  });

  test("fits every table's text inside its outline", () => {
    for (const name of ["orders", "users"]) {
      const outline = outlineOf(scene, name);
      for (const text of tableElements(scene, name).filter(e => e.type === "text")) {
        expect(text.x).toBeGreaterThan(outline.x);
        expect(text.x + text.width).toBeLessThan(outline.x + outline.width);
        expect(text.y).toBeGreaterThan(outline.y);
        expect(text.y + text.height).toBeLessThan(outline.y + outline.height);
      }
    }
  });

  test("right-aligns the constraint badges on one edge", () => {
    const badges = tableElements(scene, "users").filter(e => ["PK", "FK", "UNQ"].includes(e.text!));
    expect(badges.map(e => e.textAlign)).toEqual(["right", "right", "right"]);
    const [first, ...rest] = badges.map(e => e.x + e.width);
    for (const edge of rest) expect(edge).toBeCloseTo(first!);
  });

  test("binds an arrow from the foreign key's row to the referenced row", () => {
    const from = rowOf(scene, "orders", "user_id?");
    const to = rowOf(scene, "users", "id");
    const arrow = arrowFrom(scene, from);
    expect(arrow.endBinding?.elementId).toBe(to.id);
    expect(arrow.elbowed).toBe(true);
    expect(arrow.endArrowhead).toBe("arrow");
    // Excalidraw moves an arrow with a table only if the table lists it too.
    expect(from.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
    expect(to.boundElements).toContainEqual({ id: arrow.id, type: "arrow" });
  });

  test("ends arrows just off the rows' sides, where Excalidraw would", () => {
    const from = rowOf(scene, "orders", "user_id?");
    const arrow = arrowFrom(scene, from);
    const [[x, y]] = ends(arrow);
    expect([from.x - 5, from.x + from.width + 5]).toContain(x);
    expect(y).toBe(from.y + from.height / 2);
    const binding = arrow.startBinding!;
    expect(binding.gap).toBe(5);
    expect(binding.fixedPoint[0]).toBeCloseTo((x - from.x) / from.width);
    expect(binding.fixedPoint[1]).toBe(0.5001);
  });

  test("routes every arrow in right angles", () => {
    for (const arrow of arrowsOf(scene)) {
      const points = arrow.points!;
      for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1]!;
        const [x1, y1] = points[i]!;
        expect(x0 === x1 || y0 === y1).toBe(true);
      }
    }
  });

  test("loops a table's arrow to itself out of its right side", () => {
    const from = rowOf(scene, "users", "manager_id?");
    const to = rowOf(scene, "users", "id");
    const arrow = arrowFrom(scene, from);
    expect(arrow.endBinding?.elementId).toBe(to.id);
    const right = outlineOf(scene, "users").x + outlineOf(scene, "users").width;
    const [[startX, startY], [endX, endY]] = ends(arrow);
    expect([startX, endX]).toEqual([right + 5, right + 5]);
    expect(startY).toBe(from.y + from.height / 2);
    expect(endY).toBe(to.y + to.height / 2);
    expect(Math.min(...arrow.points!.map(([x]) => arrow.x + x))).toBeGreaterThan(right);
  });

  test("gives every element its own id", () => {
    const ids = scene.elements.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test(
    "renders the same schema to the same file",
    async () => {
      expect(await renderExcalidraw(SCHEMA, BASE)).toBe(json);
    },
    WASM_TIMEOUT,
  );

  test(
    "leaves out types and markers when told to",
    async () => {
      const bare = await render(SCHEMA, { types: "none", nullableMarkers: false });
      const texts = tableElements(bare, "users").map(e => e.text);
      expect(texts).toContain("manager_id");
      expect(texts).not.toContain("manager_id?");
      expect(texts).not.toContain("uuid");
      expect(arrowsOf(bare)).toHaveLength(2);
    },
    WASM_TIMEOUT,
  );

  test(
    "draws tables whose names D2 escapes, and fits names beyond ASCII",
    async () => {
      const names = ['we"ird', "a.b", "with space", "ñandú_日本"];
      const odd = await render(
        schemaOf(
          names.map(name =>
            table(name, [
              column("id", { isPrimaryKey: true }),
              column("next", { isForeignKey: true }),
            ]),
          ),
          names.map((name, i) => ({
            table: name,
            column: "next",
            refTable: names[(i + 1) % names.length]!,
            refColumn: "id",
          })),
        ),
      );
      expect(arrowsOf(odd)).toHaveLength(names.length);
      for (const name of names) {
        const outline = outlineOf(odd, name);
        const title = tableElements(odd, name).find(e => e.text === name)!;
        expect(title.x + title.width).toBeLessThan(outline.x + outline.width);
      }
    },
    WASM_TIMEOUT,
  );

  test(
    "draws a duplicated foreign key twice, under distinct ids",
    async () => {
      const edge = { table: "orders", column: "user_id", refTable: "users", refColumn: "id" };
      const doubled = await render({ ...SCHEMA, edges: [edge, edge] });
      const arrows = arrowsOf(doubled);
      expect(arrows).toHaveLength(2);
      expect(arrows[0]!.id).not.toBe(arrows[1]!.id);
      expect(rowOf(doubled, "orders", "user_id?").boundElements).toHaveLength(2);
    },
    WASM_TIMEOUT,
  );
});
