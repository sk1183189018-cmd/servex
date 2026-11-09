import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Apply every pending SQL migration. Safe to run repeatedly. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("Migrations applied"))
    .catch((error: unknown) => {
      console.error("Migration failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
