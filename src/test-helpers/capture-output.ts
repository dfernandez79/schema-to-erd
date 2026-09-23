import type { Output } from "../types.ts";

type CapturedOutput = Output & {
  /** Everything written so far, joined. */
  text: () => string;
};

const captureOutput = (): CapturedOutput => {
  const chunks: string[] = [];
  return {
    write: async data => {
      const text = String(data);
      chunks.push(text);
      return text.length;
    },
    text: () => chunks.join(""),
  };
};

export { type CapturedOutput, captureOutput };
