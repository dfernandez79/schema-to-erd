import type { Output } from "../types.ts";

type CapturedOutput = Output & {
  /** Everything written so far, joined. */
  text: () => string;
};

const captureOutput = (): CapturedOutput => {
  const chunks: string[] = [];
  return {
    write: text => {
      chunks.push(text);
    },
    text: () => chunks.join(""),
  };
};

export { type CapturedOutput, captureOutput };
