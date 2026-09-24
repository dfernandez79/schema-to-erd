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
