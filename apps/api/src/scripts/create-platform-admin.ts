import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { PasswordService } from "../auth/password.service.js";
import { AppError } from "../common/errors.js";
import { users } from "../db/schema.js";
import * as schema from "../db/schema.js";

/**
 * Create (or promote) the first platform Super Admin. There is no sign-up path for this role on
 * purpose. Run once per environment:
 *
 *   DATABASE_URL=... PLATFORM_ADMIN_EMAIL=you@company.com PLATFORM_ADMIN_NAME="Your Name" \
 *   PLATFORM_ADMIN_PASSWORD=... node dist/scripts/create-platform-admin.js
 *
 * The password is read from the environment only so it never lands in shell history as an
 * argument, and it is never printed.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.PLATFORM_ADMIN_NAME?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!databaseUrl || !email || !fullName || !password) {
    throw new Error(
      "Set DATABASE_URL, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME and PLATFORM_ADMIN_PASSWORD",
    );
  }
  const passwords = new PasswordService();
  passwords.assertAcceptable(password, email);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const db = drizzle(pool, { schema });
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing !== undefined) {
      await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, existing.id));
      console.log(
        `Existing user ${email} is now a platform admin. Their password was not changed.`,
      );
    } else {
      await db.insert(users).values({
        email,
        fullName,
        passwordHash: await passwords.hash(password),
        isPlatformAdmin: true,
      });
      console.log(`Platform admin ${email} created.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AppError && Array.isArray(error.details)) {
    for (const detail of error.details as { path: string; message: string }[]) {
      console.error(`${detail.path}: ${detail.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
