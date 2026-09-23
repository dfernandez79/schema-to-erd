/** Set to 1 to run only the unit tests, without Docker. */
const NO_DATABASE = process.env.SKIP_DB_TESTS === "1";

const testDatabaseUrl = (): string => {
  const url = process.env.TEST_DATABASE_URL ?? "";
  if (url === "") throw new Error("TEST_DATABASE_URL not set; is Docker running?");
  return url;
};

export { NO_DATABASE, testDatabaseUrl };
