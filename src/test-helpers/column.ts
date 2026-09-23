import type { Column } from "../types.ts";

const column = (name: string, overrides: Partial<Column> = {}): Column => ({
  name,
  ordinal: 0,
  nullable: false,
  baseType: "text",
  fullType: "text",
  isPrimaryKey: false,
  isForeignKey: false,
  isUnique: false,
  ...overrides,
});

export { column };
