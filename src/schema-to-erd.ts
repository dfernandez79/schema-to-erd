#!/usr/bin/env bun
import { runCliWithParsedArgs } from "./args/run-cli-with-parsed-args.ts";
import { cli } from "./cli.ts";

if (import.meta.main) {
  process.exit(await runCliWithParsedArgs(cli));
}
