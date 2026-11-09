# SERVEX architecture

This is the working architecture. It describes what the repo is aiming for and marks what exists today.
Anything not marked as done is a plan, not a fact.

## Shape of the system

SERVEX starts as a **modular monolith**: one backend, one database, clear module boundaries. We split
into services only if a concrete scaling or team problem shows up.

```
servex/
  apps/
    web/          Next.js app (exists, foundation only)
    api/          NestJS backend (exists: auth, tenants, RBAC, audit, customers)
    mobile/       Expo / React Native       (Phase 6, not created yet)
    desktop/      Tauri wrapper around web  (Phase 8, not created yet)
  packages/
    shared/       Domain constants and pure utilities (exists)
  docs/           Architecture, roadmap, decision records
```

## Stack decisions

| Area     | Choice                                     | Why                                                                   |
| -------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Language | TypeScript everywhere                      | One language across web, API, mobile; shared types and rules.         |
| Web      | Next.js 15, React 19                       | Already chosen in the repo.                                           |
| Backend  | NestJS, REST + OpenAPI                     | Structured modules, guards and DI suit RBAC and tenancy.              |
| Database | PostgreSQL                                 | Constraints, transactions, row-level security.                        |
| ORM      | Drizzle ORM + drizzle-kit                  | Pure JS, SQL migrations in git, easy raw SQL for RLS. See decision 1. |
| Mobile   | Expo (React Native)                        | Cloud builds through EAS, so no local Android toolchain needed.       |
| Desktop  | Tauri                                      | Small installers, reuses the web UI.                                  |
| Styling  | Tailwind CSS, added with the design system | Not added yet on purpose, to avoid unused dependencies in Phase 1.    |
| CI       | GitHub Actions                             | Everything builds in the cloud.                                       |

## Rules the code must follow

**Tenant isolation.** Every tenant-owned table carries an `organization_id`. The backend derives the
organization from the authenticated session, never from a client-supplied ID. PostgreSQL row-level
security is the second line of defence behind application checks. Cross-tenant tests are required
before any module is called done.

**Permissions.** Enforced on the backend for every request. `packages/shared` holds the default
role-to-permission map, but the UI hiding a button is never the control.

**Money.** Integer minor units in `bigint` in code, `NUMERIC` in the database. No floats. See
`packages/shared/src/money.ts`.

**Audit.** State changes to jobs, money, stock and permissions write an audit record. Work-order status
history is append-only.

**Secrets.** Never committed. GitHub Secrets and hosting environment variables only. AI provider keys
stay server-side.

**Compliance.** Tax and privacy features are built to be configurable. Nothing here claims legal or
tax compliance until a qualified professional has reviewed it.

## What exists today

- pnpm workspace, strict TypeScript base config, Prettier, ESLint.
- `packages/shared`: roles, default permissions, work-order statuses and transitions, decimal-safe
  money helpers including a GST split. Compiled to `dist` so the API (Node ESM) and web share it.
- `apps/api` (NestJS 12, Drizzle, PostgreSQL): sign-up, login with lockout, refresh-token rotation
  with reuse detection, logout, role/permission guards, row-level security, append-only audit log,
  organization settings, member role/status management, customers CRUD with search and pagination.
  Details and endpoints: `docs/API.md`.
- `apps/web`: buildable Next.js app with a status page and `/api/health`. No product screens yet.
- CI: format, lint, typecheck, migration drift check, migrations twice, tests against PostgreSQL,
  build, dependency audit.

## Decisions log

1. **Drizzle instead of Prisma (Phase 2).** Prisma 7 downloads its schema-engine binary from
   `binaries.prisma.sh`, which is blocked in the cloud build sandbox, so migrations could not be run
   and verified there. Drizzle is pure JavaScript, keeps migrations as plain SQL files in git, and
   makes the row-level-security SQL and `SET LOCAL ROLE` pattern straightforward. Tests run against a
   real PostgreSQL either way.
2. **Two database paths.** Sign-up, login, refresh and platform work use the trusted owner
   connection (`DatabaseService.root`). Everything that touches a company's own data goes through
   `DatabaseService.tenant(orgId, fn)`, which switches to the `servex_app` role and sets
   `app.org_id`, so row-level security applies. The org id comes from the session, never the request.
3. **Permissions are read from the database on every request**, not from the token. Demoting or
   disabling a user takes effect on their next call. Cost: one indexed query per request.
4. **Deny by default.** A route with no `@Public()`, `@Authenticated()` or `@RequirePermissions()` is
   refused by the guard.
5. **Platform admin has no company data access.** A Super Admin session is not inside any company;
   tenant routes answer 403.

## Open decisions

These need an answer before the phase that depends on them.

1. **Hosting and database provider** (before Phase 2 goes live): affects cost.
2. **Email, SMS and WhatsApp providers** (Phase 4): WhatsApp needs an official Business API account.
3. **Payment gateway** (Phase 5): Razorpay for India, Stripe for international is the likely pair.
4. **Expo account** (Phase 6): needed for cloud Android builds.
