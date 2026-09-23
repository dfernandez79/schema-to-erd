import type { Schema, Table } from "../types.ts";

const schemaOf = (tables: Table[], edges: Schema["edges"] = []): Schema => ({
  schema: "public",
  tables,
  edges,
});

export { schemaOf };
