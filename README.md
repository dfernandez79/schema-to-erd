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
schema-to-erd --help
```

The connection is specified by `--database` and falls back to `$DATABASE_URL`.
`--database` accepts a full `postgres://` or `postgresql://` URL.

## Output formats

| Format | Output                                                                   |
| ------ | ------------------------------------------------------------------------ |
| `d2`   | D2 source. The default.                                                  |
| `svg`  | SVG, rendered by D2's bundled WebAssembly build. No `d2` install needed. |

`--format` picks the format. Without it, the `--output` extension decides
(`.d2`, `.svg`), and any other extension, or stdout, gets D2. A `--format` that
contradicts the extension is a usage error: `--format=svg --output=erd.d2` fails
instead of writing SVG into a `.d2` file.

SVG output is laid out with the ELK engine, as `d2 --layout=elk` would. To use
another engine, such as TALA, render the D2 source with the `d2` CLI. Avoid D2's
default engine, which points foreign key arrows to the table box rather than the
specific row:

```bash
schema-to-erd --tables=orders,users | d2 --layout=tala - erd.svg
```

## Options

| Flag                       | Meaning                                        |
| -------------------------- | ---------------------------------------------- |
| `--database=<url>`         | Connection URL. Defaults to `$DATABASE_URL`.   |
| `--tables=a,b`             | Only these tables. Omit for the whole schema.  |
| `--schema=<name>`          | Schema to read. Default `public`.              |
| `--types=none\|base\|full` | Type detail. Default `base`.                   |
| `--hide-types`             | Alias for `--types=none`.                      |
| `--no-nullable-markers`    | Drop the `?` suffix on nullable columns.       |
| `--exclude-fields=<re>`    | Drop matching columns. Repeatable.             |
| `--format=d2\|svg`         | Output format. Default from `--output`, or d2. |
| `--output=<path>`          | Write to a file instead of stdout. Overwrites. |
| `-h`, `--help`             | Show help.                                     |

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
