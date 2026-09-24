/**
 * Excalidraw's hand-drawn font: its id in a scene, and the line height
 * Excalidraw sets it in.
 */
const EXCALIFONT = 5;
const EXCALIFONT_LINE_HEIGHT = 1.25;

/**
 * Advance widths of Excalifont's printable ASCII glyphs, U+0020 to U+007E, in
 * thousandths of an em. Read from Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2,
 * the Latin subset @excalidraw/excalidraw 0.18.1 ships.
 */
const ASCII_ADVANCES: readonly number[] = [
  400, 314, 371, 783, 721, 928, 718, 218, 441, 402, 525, 550, 257, 411, 274, 561, 664, 427, 700,
  608, 585, 618, 640, 558, 636, 629, 264, 298, 550, 550, 550, 466, 829, 676, 761, 629, 780, 707,
  661, 780, 573, 545, 569, 613, 543, 766, 632, 767, 698, 768, 736, 622, 857, 730, 592, 786, 628,
  564, 832, 472, 589, 497, 510, 670, 600, 576, 555, 504, 605, 537, 497, 555, 567, 244, 328, 533,
  225, 663, 526, 600, 537, 539, 412, 543, 553, 548, 525, 693, 591, 530, 572, 504, 299, 544, 669,
];

/**
 * The ASCII pairs Excalifont kerns apart, in thousandths of an em. Pairs it
 * kerns together are left out, so measurements err wide rather than short.
 */
const WIDENING_PAIRS: Readonly<Record<string, number>> = {
  "(j": 60,
  "0t": 10,
  "@t": 10,
  "L!": 30,
  "L,": 30,
  "L.": 30,
  Ot: 10,
  Qj: 50,
  Ti: 30,
  jj: 100,
  qj: 50,
  rf: 20,
  ri: 20,
  rt: 30,
  v0: 30,
  v6: 30,
  "v@": 30,
  vC: 30,
  vO: 30,
  vQ: 30,
  vt: 30,
  vv: 30,
  vw: 30,
  w0: 30,
  w6: 30,
  "w@": 30,
  wC: 30,
  wO: 30,
  wQ: 30,
  wt: 30,
  wv: 30,
  ww: 30,
  yv: 30,
  yw: 30,
};

/** A full em: as wide as a CJK glyph from the fallback font, and wider than most others. */
const FALLBACK_ADVANCE = 1000;

/** Estimates, erring wide, the width Excalidraw measures for one line of text. */
const textWidth = (text: string, fontSize: number): number => {
  let units = 0;
  let previous = "";
  for (const char of text) {
    units +=
      (ASCII_ADVANCES[char.charCodeAt(0) - 32] ?? FALLBACK_ADVANCE) +
      (WIDENING_PAIRS[previous + char] ?? 0);
    previous = char;
  }
  return (units * fontSize) / 1000;
};

export { EXCALIFONT, EXCALIFONT_LINE_HEIGHT, textWidth };
