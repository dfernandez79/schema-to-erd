const HELP = `schema-to-erd - generate a D2 ERD from a PostgreSQL schema

Usage:
  schema-to-erd [options]

Connection:
  --database=<url>        PostgreSQL connection URL (postgres:// or postgresql://).
                          Defaults to $DATABASE_URL.

Selection:
  --tables=a,b            Only these tables. Omit for every table in the schema.
                          Schema-qualified names are not accepted; use --schema.
  --schema=<name>         Schema to read. Default: public.

Rendering:
  --types=none|base|full  Column type detail. Default: base.
                            none  no types at all
                            base  varchar, numeric, timestamptz
                            full  character varying(255), numeric(10,2)
  --hide-types            Alias for --types=none.
  --no-nullable-markers   Do not append '?' to nullable column names.
  --exclude-fields=<re>   Drop columns whose 'schema.table.field' path matches
                          this regular expression. Unanchored and
                          case-sensitive. Repeatable.

Output:
  --output=<path>         Write to this file, overwriting it. Default: stdout.
  -h, --help              Show this help.

Examples:
  schema-to-erd --database=postgres://localhost/shop
  schema-to-erd --tables=orders,order_items --schema=sales
  schema-to-erd --tables=orders --exclude-fields='orders\\.updatedAt'
  schema-to-erd --types=none --output=erd.d2
`;

export { HELP };
