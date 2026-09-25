# Schema to ERD

Generates an entity-relationship diagram from a live PostgreSQL schema and emits
D2 source, SVG, or Excalidraw.

## Install

```bash
bun install
bun link
```

`bun link` puts `schema-to-erd` on your PATH. Without it, run
`bun run src/schema-to-erd.ts` with the same arguments.

## Usage

```bash
schema-to-erd --database=postgres://user:pass@localhost/shop
schema-to-erd --tables=orders,order_items --schema=sales
schema-to-erd --tables=orders --exclude-fields='orders\.updatedAt'
schema-to-erd --types=none --output=erd.d2
schema-to-erd --tables=orders,users --output=erd.svg
schema-to-erd --output=erd.excalidraw
schema-to-erd --layout=dagre --output=erd.svg
schema-to-erd --help
```

The connection is specified by `--database` and falls back to `$DATABASE_URL`.
`--database` accepts a full `postgres://` or `postgresql://` URL.

## Output formats

| Format       | Output                                                                   |
| ------------ | ------------------------------------------------------------------------ |
| `d2`         | D2 source. The default.                                                  |
| `svg`        | SVG, rendered by D2's bundled WebAssembly build. No `d2` install needed. |
| `excalidraw` | Excalidraw scene, to open and keep editing in Excalidraw.                |

`--format` sets the format. If it’s omitted, the `--output` extension determines
the format (`.d2`, `.svg`, or `.excalidraw`); any other extension, or stdout,
defaults to D2. If `--format` conflicts with the extension, it’s a usage error:
`--format=svg --output=erd.d2` fails rather than writing SVG to a `.d2` file.

Excalidraw output uses the same layout as SVG, with tables sized for
Excalidraw's hand-drawn font. Each table is a group. Element IDs are derived
from table and column names, so the same schema always produces the same file,
and a schema change produces a small diff.

## Layout

`--layout` selects the engine that places tables and routes arrows: `elk` (the
default), `dagre`, or `tala`. The tool uses a bundled D2 in WebAssembly. If you
specify a layout for a D2 output, the `.d2` file will include a config block
that sets the layout (you can override it via the d2 CLI).

If you need to refine the output style, use d2.

The default layout is `elk` because it’s slightly faster with the bundled
WebAssembly d2 package. However, in many cases, `tala` will produce better
results.

## Options

| Flag                           | Meaning                                        |
| ------------------------------ | ---------------------------------------------- |
| `--database=<url>`             | Connection URL. Defaults to `$DATABASE_URL`.   |
| `--tables=a,b`                 | Only these tables. Omit for the whole schema.  |
| `--schema=<name>`              | Schema to read. Default `public`.              |
| `--types=none\|base\|full`     | Type detail. Default `base`.                   |
| `--hide-types`                 | Alias for `--types=none`.                      |
| `--no-nullable-markers`        | Drop the `?` suffix on nullable columns.       |
| `--exclude-fields=<re>`        | Drop matching columns. Repeatable.             |
| `--format=d2\|svg\|excalidraw` | Output format. Default from `--output`, or d2. |
| `--layout=elk\|dagre\|tala`    | Layout engine. Default `elk`.                  |
| `--output=<path>`              | Write to a file instead of stdout. Overwrites. |
| `-h`, `--help`                 | Show help.                                     |

### Type detail

| Mode   | `email` renders as                  |
| ------ | ----------------------------------- |
| `none` | `"email"`                           |
| `base` | `"email": "varchar"`                |
| `full` | `"email": "character varying(255)"` |

### Excluding fields

`--exclude-fields` takes a regular expression that is matched unanchored and
case-sensitively against the `schema.table.field` path:

```bash
# every updatedAt column
--exclude-fields='updatedAt'

# only orders.updatedAt
--exclude-fields='orders\.updatedAt'
```

## Exit codes

| Code | Meaning                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 0    | Success, and `--help`.                                                                                |
| 1    | Runtime failure: a table in `--tables` does not exist, the schema is empty, or the connection failed. |
| 2    | Usage error. Prints help to stderr.                                                                   |

## Tests

```bash
bun test           # unit + integration; needs Docker
bun run test:unit  # unit only, no Docker
```

## License

[MIT](LICENSE)
