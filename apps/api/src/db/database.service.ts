import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ENV, type Env } from "../config/env.js";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything queries can run on: the pool or an open transaction. */
export type Executor = Db | Tx;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: pg.Pool;
  /**
   * Trusted connection (table owner). Use it only for work that is not tenant-scoped: sign-up,
   * login, token refresh and platform administration. Never use it for a tenant's own data.
   */
  readonly root: Db;

  constructor(@Inject(ENV) env: Env) {
    this.pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 30_000,
    });
    this.root = drizzle(this.pool, { schema });
  }

  /**
   * Run `work` inside a transaction that is locked to one organization.
   *
   * The transaction switches to the servex_app role and sets app.org_id, so PostgreSQL row-level
   * security filters every read and rejects every write that belongs to another organization,
   * even if a query forgets its own WHERE clause. The organization id must come from the
   * authenticated session, never from the request body or URL.
   */
  async tenant<T>(organizationId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID_PATTERN.test(organizationId)) {
      throw new Error("tenant() called with an invalid organization id");
    }
    return this.root.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.org_id', ${organizationId}, true)`);
      await tx.execute(sql`SET LOCAL ROLE servex_app`);
      return work(tx);
    });
  }

  async ping(): Promise<void> {
    await this.root.execute(sql`SELECT 1`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
