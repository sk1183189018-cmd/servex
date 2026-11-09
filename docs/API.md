# SERVEX API

Base path: `/api/v1`. JSON in, JSON out. Source: `apps/api`.

## Running it

Needs Node 22, pnpm, and a PostgreSQL 16 database.

```bash
pnpm install
cp .env.example apps/api/.env      # then fill DATABASE_URL and AUTH_JWT_SECRET
pnpm --filter @servex/api db:migrate
pnpm --filter @servex/api dev
```

Create the first platform Super Admin (there is no sign-up for this role on purpose):

```bash
pnpm --filter @servex/api build
DATABASE_URL=... PLATFORM_ADMIN_EMAIL=you@company.com PLATFORM_ADMIN_NAME="Your Name" \
PLATFORM_ADMIN_PASSWORD='...' pnpm --filter @servex/api admin:create
```

Production: `pnpm --filter @servex/api build`, then `db:migrate:prod`, then `start`.

## Database requirements

- The migration user must be allowed to create the `servex_app` role and `SET ROLE` to it. On most
  managed PostgreSQL services the default admin user can. If the migration prints a notice that it
  could not grant `servex_app`, run `GRANT servex_app TO <app user>;` once by hand.
- Never point tests at a real database. `DATABASE_URL` for `pnpm test` must be disposable.

## Errors

Every error has one shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [], "requestId": "..." } }
```

Send `X-Request-Id` (8-64 safe characters) to correlate a call; otherwise one is generated and
returned in the same header. 5xx errors never include internals.

## Authentication

1. `POST /auth/register` or `POST /auth/login` returns `accessToken` (15 minutes) and
   `refreshToken` (30 days, single use).
2. Send `Authorization: Bearer <accessToken>` on every other call.
3. When the access token expires, `POST /auth/refresh` with the refresh token. You get a new pair.
   Use each refresh token once. Replaying an old one after 10 seconds revokes the whole session.
4. `POST /auth/logout` with the refresh token ends the session.

If one account belongs to several companies, login answers `409 ORGANIZATION_SELECTION_REQUIRED`
with the list; log in again with `organizationSlug`.

Passwords: 10 to 128 characters, not containing the email name, not trivially repetitive. Stored
as argon2id. Five wrong passwords lock the account for 15 minutes.

## Endpoints

| Method | Path                       | Who                             | Notes                                              |
| ------ | -------------------------- | ------------------------------- | -------------------------------------------------- |
| GET    | `/health`, `/health/ready` | public                          | liveness, database reachability                    |
| POST   | `/auth/register`           | public                          | creates company, owner, head-office branch         |
| POST   | `/auth/login`              | public                          |                                                    |
| POST   | `/auth/refresh`            | public                          | rotates the refresh token                          |
| POST   | `/auth/logout`             | public                          | needs the refresh token                            |
| GET    | `/auth/me`                 | signed in                       | profile, company, role, permissions                |
| GET    | `/organizations/current`   | signed in                       |                                                    |
| PATCH  | `/organizations/current`   | `settings:manage`               | name, timezone, locale only                        |
| GET    | `/members`                 | `users:read`                    |                                                    |
| PATCH  | `/members/:id/role`        | `users:manage` + `roles:manage` |                                                    |
| PATCH  | `/members/:id/status`      | `users:manage`                  | `active` or `disabled`                             |
| GET    | `/customers`               | `customers:read`                | `q`, `sort`, `order`, `page`, `pageSize` (max 100) |
| GET    | `/customers/:id`           | `customers:read`                |                                                    |
| POST   | `/customers`               | `customers:write`               |                                                    |
| PATCH  | `/customers/:id`           | `customers:write`               | omitted = unchanged, `null` = clear                |
| DELETE | `/customers/:id`           | `customers:delete`              | soft delete                                        |
| GET    | `/audit-logs`              | `audit:read`                    | filter by `entityType`, `entityId`, `action`       |

Rate limits: 300 requests/min in general and 20/min on `/auth/*`, per IP. They are in memory per instance. Move them to Redis before running more than one instance.

## How tenant isolation works

1. The company comes from the signed session and is re-checked against the database on every
   request. It is never read from a body, query or URL.
2. Company data is only touched inside `DatabaseService.tenant(orgId, ...)`. That opens a
   transaction, sets `app.org_id`, and switches to the `servex_app` role.
3. PostgreSQL row-level security on every company table then limits reads and rejects writes to
   that company, even if a query forgets its `WHERE organization_id = ...`.
4. `servex_app` has only the grants it needs: it cannot read password hashes or refresh tokens,
   cannot change an organization's slug, currency, country or status, and cannot update or delete
   audit rows (a trigger blocks that for everyone, including the table owner).

`apps/api/src/tenant-isolation.test.ts` checks all of this against a real database.

## Adding a new company-owned table

1. Add it to `src/db/schema.ts` with `organization_id uuid not null references organizations`.
2. `pnpm --filter @servex/api db:generate`, then add a migration (`drizzle-kit generate --custom`)
   that enables RLS, adds the `tenant_isolation` policy, and grants only what the table needs to
   `servex_app`.
3. Access it only through `database.tenant(...)`.
4. Add a cross-company test in the style of `tenant-isolation.test.ts` before calling it done.
