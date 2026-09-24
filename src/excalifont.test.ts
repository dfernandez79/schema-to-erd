import { describe, expect, test } from "bun:test";

import { textWidth } from "./excalifont.ts";

describe("textWidth", () => {
  test("sums Excalifont's advance widths, scaled to the font size", () => {
    expect(textWidth("id", 1000)).toBe(849);
    expect(textWidth("users", 1000)).toBe(2583);
    expect(textWidth("users", 20)).toBeCloseTo(51.66);
    expect(textWidth("", 20)).toBe(0);
  });

  test("adds the space Excalifont kerns into a pair", () => {
    expect(textWidth("jj", 1000)).toBe(2 * textWidth("j", 1000) + 100);
  });

  test("counts a character beyond ASCII as a full em", () => {
    expect(textWidth("ñ", 1000)).toBe(1000);
    expect(textWidth("日本", 1000)).toBe(2000);
  });
});
