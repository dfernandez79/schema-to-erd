Default to using Bun instead of Node.js:

- `bun <file>` instead of `node <file>`
- `bun test` instead of `jest` or `vitest`
- `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or
  `pnpm run <script>`
- `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

For more information, read the Bun API docs in
`node_modules/bun-types/docs/**.mdx`.

## Runtime

The package ships as `dist/schema-to-erd.js`, built by
[bunup](https://bunup.dev) (`bun run build`) to run on Node.js. So the code it
bundles, everything under `src/` but the tests and `src/test-helpers/`, must not
use Bun's APIs: use `node:` modules, and `postgres` for PostgreSQL. oxlint
rejects the `Bun` global and imports from `bun` there. Tests run on Bun and may
use both. `src/schema-to-erd.test.ts` packs the package and runs its binary on
Node.

## Linting and formatting

This project uses [oxlint](https://oxc.rs) for linting and
[oxfmt](https://oxc.rs) for formatting. Rules and format options come from the
shared `@diegoux/oxc-config` package (`oxlint.config.ts`, `oxfmt.config.ts`);
only project-specific overrides belong in those files.

```sh
bun run lint       # report lint problems
bun run lint:fix   # apply auto-fixable lint problems
bun run fmt        # format all files in place
bun run fmt:check  # check formatting without writing
```

**After making any code change, run `bun run fmt` and `bun run lint`, and fix
everything they report before considering the change done.**
