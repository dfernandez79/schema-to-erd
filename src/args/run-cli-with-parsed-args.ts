import { HelpRequested, UsageError } from "../errors.ts";
import type { Options, Output } from "../types.ts";
import { HELP } from "./help.ts";
import { parse } from "./parse.ts";

const runCliWithParsedArgs = async (
  impl: (options: Options, stdout: Output, stderr: Output) => Promise<number>,
  argv = Bun.argv.slice(2),
  stdout: Output = Bun.stdout,
  stderr: Output = Bun.stderr,
): Promise<number> => {
  try {
    const options = parse(argv, Bun.env);
    return impl(options, stdout, stderr);
  } catch (error) {
    if (error instanceof HelpRequested) {
      stdout.write(HELP);
      return 0;
    }
    if (error instanceof UsageError) {
      stderr.write(`schema-to-erd: ${error.message}\n\n${HELP}`);
      return 2;
    }
    throw error;
  }
};

export { runCliWithParsedArgs };
