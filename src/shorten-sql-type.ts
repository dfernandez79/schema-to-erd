/**
 * `format_type(oid, NULL)` reports the SQL-standard spelling for these types,
 * which is accurate but long. Base mode prefers the short alias.
 */
const BASE_ALIASES: Record<string, string> = {
  "character varying": "varchar",
  character: "char",
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  "time with time zone": "timetz",
  "time without time zone": "time",
  "double precision": "float8",
  "bit varying": "varbit",
};

const shortenSqlType = (type: string): string => {
  const arraySuffix = type.match(/(\[\])+$/)?.[0] ?? "";
  const base = arraySuffix === "" ? type : type.slice(0, -arraySuffix.length);
  return (BASE_ALIASES[base] ?? base) + arraySuffix;
};

export { shortenSqlType };
