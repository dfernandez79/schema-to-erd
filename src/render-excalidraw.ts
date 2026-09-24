/* oxlint-disable unicorn/no-null -- Excalidraw's file format writes absent values as null. */
import type { Diagram, Point, Shape } from "@d2lang/d2";

import { layOut, withD2 } from "./d2-wasm.ts";
import { EXCALIFONT, EXCALIFONT_LINE_HEIGHT, textWidth } from "./excalifont.ts";
import {
  type Constraint,
  type RenderOptions,
  type Size,
  columnLabel,
  constraintsOf,
  renderD2,
  typeLabel,
} from "./render-d2.ts";
import type { Schema, Table } from "./types.ts";

/**
 * Every row is this tall, the header included. D2 anchors foreign key arrows
 * by dividing a table's height evenly between its rows.
 */
const ROW_HEIGHT = 40;
const FONT_SIZE = 20;
const HEADER_FONT_SIZE = 24;
const PADDING = 12;
const COLUMN_GAP = 24;
/** How far past the tables an arrow detours around their side. */
const DETOUR_REACH = 40;
/** How far from what it binds to Excalidraw ends an elbow arrow. */
const BINDING_GAP = 5;
/** Slack for D2's floating-point coordinates. */
const EPSILON = 0.5;

// Excalidraw's default palette, so the diagram looks drawn in it.
const INK = "#1e1e1e";
const MUTED = "#868e96";
const ACCENT = "#1971c2";
const HEADER_FILL = "#a5d8ff";

const ABBREVIATIONS: Record<Constraint, string> = {
  primary_key: "PK",
  foreign_key: "FK",
  unique: "UNQ",
};

type Box = { x: number; y: number; width: number; height: number };

type Element = Box & {
  id: string;
  type: "rectangle" | "text" | "arrow";
  boundElements: { id: string; type: "arrow" }[] | null;
  [property: string]: unknown;
};

type Binding = {
  elementId: string;
  focus: number;
  gap: number;
  /** Where on the target an elbow arrow ends, as fractions of its size. */
  fixedPoint?: [number, number];
};

type Row = { column: string; name: string; type?: string; constraints: string };

type MeasuredTable = Size & {
  table: Table;
  rows: Row[];
  /** Where the type column starts, from the table's left edge. */
  typeOffset: number;
};

const widest = (texts: (string | undefined)[]): number =>
  Math.max(0, ...texts.map(text => (text ? textWidth(text, FONT_SIZE) : 0)));

/** Sizes a table to fit its text as Excalidraw sets it, for D2 to lay out. */
const measure = (table: Table, options: RenderOptions): MeasuredTable => {
  const rows = table.columns.map(column => ({
    column: column.name,
    name: columnLabel(column, options),
    type: typeLabel(column, options),
    constraints: constraintsOf(column)
      .map(constraint => ABBREVIATIONS[constraint])
      .join(", "),
  }));
  const nameWidth = widest(rows.map(row => row.name));
  const typeWidth = widest(rows.map(row => row.type));
  const constraintWidth = widest(rows.map(row => row.constraints));

  const rowWidth =
    PADDING +
    nameWidth +
    (typeWidth > 0 ? COLUMN_GAP + typeWidth : 0) +
    (constraintWidth > 0 ? COLUMN_GAP + constraintWidth : 0) +
    PADDING;
  const headerWidth = PADDING + textWidth(table.name, HEADER_FONT_SIZE) + PADDING;
  return {
    table,
    rows,
    typeOffset: PADDING + nameWidth + COLUMN_GAP,
    // D2 takes whole pixels.
    width: Math.ceil(Math.max(rowWidth, headerWidth)),
    height: ROW_HEIGHT * (rows.length + 1),
  };
};

/**
 * Ids and seeds follow from what an element depicts rather than from chance,
 * so a schema always renders to the same file, and a changed schema to a
 * small diff.
 */
const identify = (path: string[]): { id: string; seed: number } => {
  const hash = Bun.hash.wyhash(JSON.stringify(path));
  // Rough.js, which draws the strokes, takes a seed of 0 to mean random.
  return { id: hash.toString(36), seed: Number(BigInt.asUintN(31, hash)) || 1 };
};

const element = (
  path: string[],
  type: Element["type"],
  box: Box,
  groupIds: string[],
  strokeColor = INK,
  backgroundColor = "transparent",
): Element => {
  const { id, seed } = identify(path);
  return {
    id,
    type,
    ...box,
    angle: 0,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds,
    frameId: null,
    index: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce: 0,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
};

/**
 * Draws a table where D2 placed it, at the size D2 settled on: D2 widens a
 * box to fit its own font, and the arrows follow D2's box.
 */
const drawTable = (
  { table, rows, typeOffset }: MeasuredTable,
  box: Box,
): { elements: Element[]; outline: Element; rowsByColumn: Map<string, Element> } => {
  const groupIds = [identify(["table", table.name]).id];
  const rowHeight = box.height / (rows.length + 1);
  const left = box.x + PADDING;
  const right = box.x + box.width - PADDING;
  const at = (...parts: string[]): string[] => ["table", table.name, ...parts];

  /** Text centred in row `line`, the header being line 0. */
  const label = (
    path: string[],
    text: string,
    line: number,
    edge: { left: number } | { right: number },
    { fontSize = FONT_SIZE, color = INK } = {},
  ): Element => {
    const width = textWidth(text, fontSize);
    const height = fontSize * EXCALIFONT_LINE_HEIGHT;
    const x = "left" in edge ? edge.left : edge.right - width;
    const y = box.y + line * rowHeight + (rowHeight - height) / 2;
    return {
      ...element(path, "text", { x, y, width, height }, groupIds, color),
      text,
      fontSize,
      fontFamily: EXCALIFONT,
      // Right-aligned, the text ends on the box's right edge whatever its true width.
      textAlign: "left" in edge ? "left" : "right",
      verticalAlign: "top",
      containerId: null,
      originalText: text,
      autoResize: true,
      lineHeight: EXCALIFONT_LINE_HEIGHT,
    };
  };

  const outline = element(at("outline"), "rectangle", box, groupIds);
  const elements = [
    outline,
    element(at("header"), "rectangle", { ...box, height: rowHeight }, groupIds, INK, HEADER_FILL),
    label(at("title"), table.name, 0, { left }, { fontSize: HEADER_FONT_SIZE }),
  ];

  const rowsByColumn = new Map<string, Element>();
  rows.forEach((row, index) => {
    const line = index + 1;
    // Invisible, but gives the arrows a row to bind to.
    const target = element(
      at("column", row.column),
      "rectangle",
      { ...box, y: box.y + line * rowHeight, height: rowHeight },
      groupIds,
      "transparent",
    );
    rowsByColumn.set(row.column, target);
    elements.push(target, label(at("column", row.column, "name"), row.name, line, { left }));
    if (row.type) {
      const path = at("column", row.column, "type");
      elements.push(label(path, row.type, line, { left: box.x + typeOffset }, { color: MUTED }));
    }
    if (row.constraints) {
      const path = at("column", row.column, "constraints");
      elements.push(label(path, row.constraints, line, { right }, { color: ACCENT }));
    }
  });

  return { elements, outline, rowsByColumn };
};

/** Excalidraw nudges a ratio off 0.5, where the side it lies on is ambiguous. */
const nudge = (ratio: number): number => (Math.abs(ratio - 0.5) < 1e-4 ? 0.5001 : ratio);

/** Binds an arrow's end, which lies BINDING_GAP off `target`, to `target`. */
const bindAt = (target: Element, point: Point): Binding => ({
  elementId: target.id,
  focus: 0,
  gap: BINDING_GAP,
  fixedPoint: [
    nudge((point.x - target.x) / target.width),
    nudge((point.y - target.y) / target.height),
  ],
});

/**
 * Moves a route's end BINDING_GAP out from the side of the row it leaves or
 * enters, where Excalidraw puts it when re-routing the arrow.
 */
const offRow = (point: Point, row: Element): Point => {
  const right = row.x + row.width;
  return Math.abs(point.x - right) < Math.abs(point.x - row.x)
    ? { x: right + BINDING_GAP, y: point.y }
    : { x: row.x - BINDING_GAP, y: point.y };
};

/** Whether `point` lies on the left or right side of `row`, within its height. */
const onSide = (point: Point, row: Box): boolean =>
  row.y < point.y &&
  point.y < row.y + row.height &&
  (Math.abs(point.x - row.x) < EPSILON || Math.abs(point.x - (row.x + row.width)) < EPSILON);

const rightAngled = (route: Point[]): boolean => {
  let previous: Point | undefined;
  for (const point of route) {
    if (
      previous &&
      Math.abs(point.x - previous.x) >= EPSILON &&
      Math.abs(point.y - previous.y) >= EPSILON
    ) {
      return false;
    }
    previous = point;
  }
  return true;
};

/**
 * Whether D2's route runs in right angles from the side of one row to the side
 * of the other, as ELK's do, except the arrow from a table to itself, which ELK
 * sends out of the table's bottom.
 */
const joinsRows = (route: Point[], from: Box, to: Box): boolean => {
  const [first, second] = route;
  const [beforeLast, last] = route.slice(-2);
  return (
    first !== undefined &&
    second !== undefined &&
    beforeLast !== undefined &&
    last !== undefined &&
    rightAngled(route) &&
    // Each end leaves its row sideways.
    onSide(first, from) &&
    Math.abs(first.y - second.y) < EPSILON &&
    onSide(last, to) &&
    Math.abs(last.y - beforeLast.y) < EPSILON
  );
};

/**
 * A right-angled route from the side of one row to the side of another, for
 * when D2's route doesn't join them. Rows far enough apart sideways are joined
 * across the gap between them; others by a detour around the nearer side.
 */
const elbowRoute = (from: Box, to: Box): Point[] => {
  // An arrow from a row to itself needs two heights to turn back on.
  const [fromY, toY] =
    from === to
      ? [from.y + from.height * 0.3, from.y + from.height * 0.7]
      : [from.y + from.height / 2, to.y + to.height / 2];
  const path = (startX: number, turnX: number, endX: number): Point[] =>
    fromY === toY
      ? [
          { x: startX, y: fromY },
          { x: endX, y: toY },
        ]
      : [
          { x: startX, y: fromY },
          { x: turnX, y: fromY },
          { x: turnX, y: toY },
          { x: endX, y: toY },
        ];

  const fromRight = from.x + from.width;
  const toRight = to.x + to.width;
  if (to.x - fromRight >= 2 * DETOUR_REACH) {
    return path(fromRight + BINDING_GAP, (fromRight + to.x) / 2, to.x - BINDING_GAP);
  }
  if (from.x - toRight >= 2 * DETOUR_REACH) {
    return path(from.x - BINDING_GAP, (toRight + from.x) / 2, toRight + BINDING_GAP);
  }
  const right = Math.max(fromRight, toRight) + DETOUR_REACH;
  const left = Math.min(from.x, to.x) - DETOUR_REACH;
  return 2 * right - fromRight - toRight <= from.x + to.x - 2 * left
    ? path(fromRight + BINDING_GAP, right, toRight + BINDING_GAP)
    : path(from.x - BINDING_GAP, left, to.x - BINDING_GAP);
};

/**
 * Binds a curve's end so it keeps aiming at `target`'s centre, as D2 aims it:
 * a focus of 0 means the centre to Excalidraw. A gap of 0 would end the arrow
 * at the centre itself; 1 is the least Excalidraw gives one ending at the edge.
 */
const aimAt = (target: Element): Binding => ({ elementId: target.id, focus: 0, gap: 1 });

const cubic = (p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point => {
  const u = 1 - t;
  const at = (a: number, b: number, c: number, d: number): number =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return { x: at(p0.x, c1.x, c2.x, p3.x), y: at(p0.y, c1.y, c2.y, p3.y) };
};

/**
 * Points along a route D2 drew as Bézier curves, whose points are mostly
 * control points. Excalidraw draws a curved arrow through its points instead.
 */
const sampleCurve = (route: Point[]): Point[] => {
  const points = route.slice(0, 1);
  for (let i = 0; i + 3 < route.length; i += 3) {
    const [p0, c1, c2, p3] = route.slice(i, i + 4);
    if (p0 && c1 && c2 && p3) {
      for (const t of [0.25, 0.5, 0.75, 1]) points.push(cubic(p0, c1, c2, p3, t));
    }
  }
  return points;
};

/**
 * An arrow along `route`, bound at both ends. What it binds lists it back, or
 * Excalidraw would leave it behind when a table moves.
 */
const arrow = (
  path: string[],
  route: Point[],
  [from, to]: [Element, Element],
  bind: (target: Element, point: Point) => Binding,
  shape: Record<string, unknown>,
): Element => {
  const first = route[0];
  const last = route.at(-1);
  if (first === undefined || last === undefined) throw new Error("an arrow needs a route");
  const xs = route.map(point => point.x);
  const ys = route.map(point => point.y);
  const box = {
    x: first.x,
    y: first.y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const drawn = {
    ...element(path, "arrow", box, []),
    points: route.map(point => [point.x - first.x, point.y - first.y]),
    lastCommittedPoint: null,
    startBinding: bind(from, first),
    endBinding: bind(to, last),
    startArrowhead: null,
    endArrowhead: "arrow",
    ...shape,
  };
  for (const target of new Set([from, to])) {
    target.boundElements = [...(target.boundElements ?? []), { id: drawn.id, type: "arrow" }];
  }
  return drawn;
};

/** Excalidraw re-routes an elbow arrow by itself when a table moves. */
const ELBOWED = { elbowed: true, fixedSegments: null, startIsSpecial: null, endIsSpecial: null };

/** Excalidraw's round arrow, which curves through its points. */
const CURVED = { roundness: { type: 2 }, elbowed: false };

/** D2 keys shapes by escaped id, but labels them with the table name. */
const labelOf = (shape: Shape): string => ("label" in shape ? shape.label : shape.id);

const boxesByTable = (diagram: Diagram): Map<string, Box> =>
  new Map(
    diagram.shapes.map(shape => [
      labelOf(shape),
      { x: shape.pos.x, y: shape.pos.y, width: shape.width, height: shape.height },
    ]),
  );

/**
 * An Excalidraw scene, laid out by D2 like the SVG is, from tables sized for
 * Excalidraw's hand-drawn font.
 */
const renderExcalidraw = async (schema: Schema, options: RenderOptions): Promise<string> => {
  const measured = schema.tables.map(table => measure(table, options));
  const source = renderD2(schema, {
    ...options,
    tableSizes: new Map(measured.map(m => [m.table.name, m])),
  });
  const { diagram } = await withD2(d2 => layOut(d2, source, options.layout));

  const boxes = boxesByTable(diagram);
  const elements: Element[] = [];
  const outlines = new Map<string, Element>();
  const rowsByTable = new Map<string, Map<string, Element>>();
  for (const m of measured) {
    const box = boxes.get(m.table.name);
    if (box === undefined) throw new Error(`D2 laid out no table '${m.table.name}'`);
    const drawn = drawTable(m, box);
    elements.push(...drawn.elements);
    outlines.set(m.table.name, drawn.outline);
    rowsByTable.set(m.table.name, drawn.rowsByColumn);
  }

  // D2 keeps the edges in the order they were written.
  const labels = new Map(diagram.shapes.map(shape => [shape.id, labelOf(shape)]));
  const seen = new Map<string, number>();
  schema.edges.forEach((edge, index) => {
    const path = [edge.table, edge.column, edge.refTable, edge.refColumn];
    const connection = diagram.connections[index];
    const fromTable = outlines.get(edge.table);
    const toTable = outlines.get(edge.refTable);
    const from = rowsByTable.get(edge.table)?.get(edge.column);
    const to = rowsByTable.get(edge.refTable)?.get(edge.refColumn);
    if (
      connection === undefined ||
      labels.get(connection.src) !== edge.table ||
      labels.get(connection.dst) !== edge.refTable ||
      fromTable === undefined ||
      toTable === undefined ||
      from === undefined ||
      to === undefined
    ) {
      throw new Error(`D2 laid out no arrow for ${path.join(", ")}`);
    }

    // A duplicated foreign key draws a second arrow, which needs its own id.
    const key = JSON.stringify(path);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    const id = ["edge", ...path, String(occurrence)];

    const route: Point[] = connection.route;
    if (connection.isCurve) {
      // Dagre curves between the tables, around the others, but not to the
      // rows. The arrow follows its curve, as the SVG does.
      elements.push(arrow(id, sampleCurve(route), [fromTable, toTable], aimAt, CURVED));
      return;
    }
    const drawnRoute = joinsRows(route, from, to)
      ? route.map((point, i) =>
          i === 0 ? offRow(point, from) : i === route.length - 1 ? offRow(point, to) : point,
        )
      : elbowRoute(from, to);
    elements.push(arrow(id, drawnRoute, [from, to], bindAt, ELBOWED));
  });

  const scene = {
    type: "excalidraw",
    version: 2,
    source: "https://github.com/dfernandez79/schema-to-erd",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
  return JSON.stringify(scene, undefined, 2) + "\n";
};

export { elbowRoute, renderExcalidraw };
