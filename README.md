# schema-to-erd

Generates a [D2](https://d2lang.com) entity-relationship diagram from a live
PostgreSQL schema. Emits D2 source only — pipe it to `d2` yourself.

## Install

```bash
bun install
bun link
```

`bun link` puts `schema-to-erd` on your PATH. Without it, run
`bun run src/cli.ts` with the same arguments.

## Usage

```bash
schema-to-erd --database=postgres://user:pass@localhost/shop
schema-to-erd --tables=orders,order_items --schema=sales
schema-to-erd --tables=orders --exclude-fields='orders\.updatedAt'
schema-to-erd --types=none --output=erd.d2
schema-to-erd --help
```

The connection comes from `--database`, falling back to `$DATABASE_URL`.
`--database` takes a full `postgres://` or `postgresql://` URL; a bare database
name is a usage error.

Render the result with the `d2` CLI. Use the ELK or TALA layout engine — under
the default engine, foreign key arrows point at the table box rather than the
specific row:

```bash
schema-to-erd --tables=orders,users | d2 --layout=elk - erd.svg
```

## Options

| Flag | Meaning |
| --- | --- |
| `--database=<url>` | Connection URL. Defaults to `$DATABASE_URL`. |
| `--tables=a,b` | Only these tables. Omit for the whole schema. |
| `--schema=<name>` | Schema to read. Default `public`. |
| `--types=none\|base\|full` | Type detail. Default `base`. |
| `--hide-types` | Alias for `--types=none`. |
| `--no-nullable-markers` | Drop the `?` suffix on nullable columns. |
| `--exclude-fields=<re>` | Drop matching columns. Repeatable. |
| `--output=<path>` | Write to a file instead of stdout. Overwrites. |
| `-h`, `--help` | Show help. |

### Type detail

| Mode | `email` renders as |
| --- | --- |
| `none` | `"email"` |
| `base` | `"email": "varchar"` |
| `full` | `"email": "character varying(255)"` |

### Excluding fields

`--exclude-fields` takes a regular expression matched, unanchored and
case-sensitively, against the `schema.table.field` path:

```bash
# every updatedAt column
--exclude-fields='updatedAt'

# only orders.updatedAt
--exclude-fields='orders\.updatedAt'
```

Excluding a foreign key column also drops its edge.

## What ends up in the diagram

- Ordinary tables and partitioned parents. Individual partitions, views,
  materialized views and foreign tables are left out.
- One `sql_table` per table, with `primary_key`, `foreign_key` and `unique`
  constraint badges. `unique` appears only for single-column uniqueness — a
  `UNIQUE (tenant_id, email)` badges neither column, because neither is unique
  on its own. A primary key is not also badged `unique`.
- Nullable columns get a `?` on the name, so the marker survives
  `--types=none`.
- Foreign key edges, but only where both tables are in the diagram. A column
  pointing outside the selection keeps its badge and loses its arrow. A
  composite foreign key draws one edge, from its first column pair.
- One schema per run. Schema-qualified names in `--tables` are rejected.

Every table and column name is quoted, so columns named `style`, `width` or
`shape` — all D2 keywords — do not break compilation.

Output is deterministic: tables alphabetical, columns primary keys first (in
their declared order), then foreign keys, then the rest alphabetically.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, and `--help`. |
| 1 | Runtime failure: a table in `--tables` does not exist, the schema is empty, the connection failed. |
| 2 | Usage error. Prints help to stderr. |

## Tests

```bash
bun test           # unit + integration; needs Docker
bun run test:unit  # unit only, no Docker
```

Integration tests introspect a real PostgreSQL via
[Testcontainers](https://node.testcontainers.org), sharing one container across
the run, and compile the generated D2 with the `d2` binary when it is
installed.
