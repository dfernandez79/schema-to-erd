import { type CompileResponse, D2 } from "@terrastruct/d2";

import type { Layout } from "./types.ts";

/**
 * Lends `use` a fresh instance of D2's WASM build. The instance runs in a
 * worker thread that would keep the process alive, so it is stopped after.
 */
const withD2 = async <T>(use: (d2: D2) => Promise<T>): Promise<T> => {
  const d2 = new D2();
  try {
    return await use(d2);
  } finally {
    // The worker is not part of the typed API.
    await (d2 as unknown as { worker?: { terminate: () => Promise<number> } }).worker?.terminate();
  }
};

/**
 * Compiles and lays out, with ELK unless told otherwise: dagre, D2's own
 * default, points foreign key arrows at the table box rather than the row.
 * The engine given here outranks any the source names in its d2-config.
 */
const layOut = (d2: D2, source: string, layout: Layout = "elk"): Promise<CompileResponse> =>
  d2.compile({ fs: { index: source }, options: { layout } });

export { layOut, withD2 };
