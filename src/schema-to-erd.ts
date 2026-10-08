#!/usr/bin/env node
import { runCliWithParsedArgs } from "./args/run-cli-with-parsed-args.ts";
import { cli } from "./cli.ts";

// Not process.exit(), which would cut short output still flushing to a pipe.
process.exitCode = await runCliWithParsedArgs(cli);
