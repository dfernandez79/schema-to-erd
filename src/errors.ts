/** A problem with how the command was invoked. Exits 2. */
class UsageError extends Error {}

/** A problem encountered while doing the work. Exits 1. */
class RunError extends Error {}

/** Thrown for `--help`, which is a success. */
class HelpRequested extends Error {}

export { HelpRequested, RunError, UsageError };
