import { beforeAll, describe, expect, test } from "bun:test";

import type { RenderOptions } from "./render-d2.ts";
import { elbowRoute, renderExcalidraw } from "./render-excalidraw.ts";
import { column } from "./test-helpers/column.ts";
import { schemaOf } from "./test-helpers/schema-of.ts";
import { table } from "./test-helpers/table.ts";
import type { Layout, Schema } from "./types.ts";

/** Loading D2's WASM takes a second or two, past bun's default timeout. */
const WASM_TIMEOUT = 30_000;

const BASE: RenderOptions = { types: "base", nullableMarkers: true };

type Binding = { elementId: string; focus: number; gap: number; fixedPoint?: [number, number] };

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
  roundness?: { type: number } | null;
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

const LAYOUTS: Layout[] = ["elk", "dagre", "tala"];

describe.each(LAYOUTS)("renderExcalidraw, laid out with %s", layout => {
  let json = "";
  let scene: Scene;

  beforeAll(async () => {
    json = await renderExcalidraw(SCHEMA, { ...BASE, layout });
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

  test("binds both ends of every arrow to elements that list it back", () => {
    const byId = new Map(scene.elements.map(e => [e.id, e]));
    const arrows = arrowsOf(scene);
    expect(arrows).toHaveLength(2);
    for (const arrow of arrows) {
      for (const binding of [arrow.startBinding, arrow.endBinding]) {
        // Excalidraw moves an arrow with a table only if the table lists it too.
        expect(byId.get(binding!.elementId)?.boundElements).toContainEqual({
          id: arrow.id,
          type: "arrow",
        });
      }
    }
  });

  test("gives every element its own id", () => {
    const ids = scene.elements.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test(
    "renders the same schema to the same file",
    async () => {
      expect(await renderExcalidraw(SCHEMA, { ...BASE, layout })).toBe(json);
    },
    WASM_TIMEOUT,
  );
});

// Both engines route in right angles from row to row.
describe.each(["elk", "tala"] as const)("renderExcalidraw, laid out with %s", layout => {
  let scene: Scene;

  beforeAll(async () => {
    scene = await render(SCHEMA, { ...BASE, layout });
  }, WASM_TIMEOUT);

  test("binds an elbow arrow from the foreign key's row to the referenced row", () => {
    const from = rowOf(scene, "orders", "user_id?");
    const to = rowOf(scene, "users", "id");
    const arrow = arrowFrom(scene, from);
    expect(arrow.endBinding?.elementId).toBe(to.id);
    expect(arrow.elbowed).toBe(true);
    expect(arrow.endArrowhead).toBe("arrow");
  });

  test("ends arrows just off the rows' sides, where Excalidraw would", () => {
    const from = rowOf(scene, "orders", "user_id?");
    const arrow = arrowFrom(scene, from);
    const [[x, y]] = ends(arrow);
    expect([from.x - 5, from.x + from.width + 5]).toContain(x);
    expect(y).toBe(from.y + from.height / 2);
    const binding = arrow.startBinding!;
    expect(binding.gap).toBe(5);
    const [ratioX, ratioY] = binding.fixedPoint ?? [];
    expect(ratioX).toBeCloseTo((x - from.x) / from.width);
    expect(ratioY).toBe(0.5001);
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
});

const near = (value: number, edge: number): boolean => Math.abs(value - edge) < 1;

/** Whether `point` lies on the edge of `box`, give or take a pixel. */
const onEdge = ([x, y]: [number, number], box: SceneElement): boolean => {
  const [left, right, top, bottom] = [box.x, box.x + box.width, box.y, box.y + box.height];
  const inside = x > left - 1 && x < right + 1 && y > top - 1 && y < bottom + 1;
  return inside && (near(x, left) || near(x, right) || near(y, top) || near(y, bottom));
};

describe("renderExcalidraw, laid out with dagre", () => {
  let scene: Scene;

  beforeAll(async () => {
    scene = await render(SCHEMA, { ...BASE, layout: "dagre" });
  }, WASM_TIMEOUT);

  test("draws dagre's curves, which join tables rather than rows, as the SVG does", () => {
    const orders = outlineOf(scene, "orders");
    const users = outlineOf(scene, "users");
    const arrow = arrowFrom(scene, orders);
    expect(arrow.endBinding?.elementId).toBe(users.id);
    expect(arrow.elbowed).toBe(false);
    expect(arrow.roundness).toEqual({ type: 2 });
    const [start, end] = ends(arrow);
    expect(onEdge(start, orders)).toBe(true);
    expect(onEdge(end, users)).toBe(true);
    // D2 aims the curve at each table's centre, which Excalidraw calls focus 0.
    expect(arrow.startBinding?.focus).toBe(0);
    expect(arrow.endBinding?.focus).toBe(0);
    // With a gap of 0, Excalidraw would move the ends to the centres once a
    // table is dragged.
    expect(arrow.startBinding?.gap).toBeGreaterThan(0);
    expect(arrow.endBinding?.gap).toBeGreaterThan(0);
  });

  test("draws a table's arrow to itself as a curve too", () => {
    const users = outlineOf(scene, "users");
    const arrow = arrowFrom(scene, users);
    expect(arrow.endBinding?.elementId).toBe(users.id);
    expect(arrow.roundness).toEqual({ type: 2 });
  });
});

describe("renderExcalidraw", () => {
  test(
    "lays out with ELK unless told otherwise, or with the engine it is told",
    async () => {
      const [unset, elk, dagre, tala] = await Promise.all([
        render(SCHEMA),
        render(SCHEMA, { ...BASE, layout: "elk" }),
        render(SCHEMA, { ...BASE, layout: "dagre" }),
        render(SCHEMA, { ...BASE, layout: "tala" }),
      ]);
      expect(unset).toEqual(elk);
      expect(dagre).not.toEqual(elk);
      expect(tala).not.toEqual(elk);
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

const box = (x: number, y: number, width = 100) => ({ x, y, width, height: 40 });

describe("elbowRoute", () => {
  test("crosses the gap between rows far enough apart sideways", () => {
    expect(elbowRoute(box(0, 0), box(300, 200))).toEqual([
      { x: 105, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 220 },
      { x: 295, y: 220 },
    ]);
    expect(elbowRoute(box(300, 200), box(0, 0))).toEqual([
      { x: 295, y: 220 },
      { x: 200, y: 220 },
      { x: 200, y: 20 },
      { x: 105, y: 20 },
    ]);
  });

  test("runs straight across between rows at one height", () => {
    expect(elbowRoute(box(0, 0), box(300, 0))).toEqual([
      { x: 105, y: 20 },
      { x: 295, y: 20 },
    ]);
  });

  test("detours around the nearer side of tables that overlap sideways", () => {
    expect(elbowRoute(box(0, 0, 200), box(150, 200))).toEqual([
      { x: 205, y: 20 },
      { x: 290, y: 20 },
      { x: 290, y: 220 },
      { x: 255, y: 220 },
    ]);
    expect(elbowRoute(box(100, 0, 200), box(50, 200))).toEqual([
      { x: 95, y: 20 },
      { x: 10, y: 20 },
      { x: 10, y: 220 },
      { x: 45, y: 220 },
    ]);
  });

  test("turns an arrow from a row to itself back on two heights", () => {
    const row = box(0, 0);
    expect(elbowRoute(row, row)).toEqual([
      { x: 105, y: 12 },
      { x: 140, y: 12 },
      { x: 140, y: 28 },
      { x: 105, y: 28 },
    ]);
  });
});
