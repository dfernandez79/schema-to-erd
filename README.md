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

`--format` picks the format. Without it, the `--output` extension decides
(`.d2`, `.svg`, `.excalidraw`), and any other extension, or stdout, gets D2. A
`--format` that contradicts the extension is a usage error:
`--format=svg --output=erd.d2` fails instead of writing SVG into a `.d2` file.

Excalidraw output uses the same layout as SVG, with tables sized for
Excalidraw's hand-drawn font. Each table is a group. Element ids come from table
and column names, so the same schema always produces the same file and a schema
change produces a small diff.

## Layout

`--layout` picks the engine that places the tables and routes the arrows: `elk`,
the default, `dagre` or `tala`. D2's bundled WebAssembly build has all three.

With `elk` and `tala`, foreign key arrows run in right angles from the column's
row to the referenced row, and in Excalidraw they are elbow arrows that re-route
when a table moves. With `dagre`, they are curves that join tables rather than
rows, in SVG and Excalidraw alike.

TALA is slow in WebAssembly: about 4 seconds for 14 tables and a minute and a
half for 60, where ELK takes about a second either way. Recent `d2` releases
bundle TALA too and run it about ten times faster, so for a large schema, write
D2 and render it with the `d2` CLI:

```bash
schema-to-erd --layout=tala --format=d2 | d2 - erd.svg
```

D2 output names no engine unless you pass `--layout`. With it, the file starts
with a `d2-config` block, and the `d2` CLI lays the file out with that engine
unless it gets `--layout` itself:

```d2
vars: {
  d2-config: {
    layout-engine: elk
  }
}
```

D2 rejects the block in a file imported as a nested object (`erd: @erd`), but a
spread import (`...@erd`) works.

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
