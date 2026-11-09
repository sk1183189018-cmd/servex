import { runMigrations } from "../src/db/migrate.js";

/** Apply migrations to the test database once before any test file runs. */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error(
      "DATABASE_URL must point at a disposable PostgreSQL database for the API tests " +
        "(for example postgresql://user:pass@localhost:5432/servex_test). Never use a real database.",
    );
  }
  await runMigrations(url);
}
