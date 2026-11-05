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
    api/          NestJS backend            (Phase 2, not created yet)
    mobile/       Expo / React Native       (Phase 6, not created yet)
    desktop/      Tauri wrapper around web  (Phase 8, not created yet)
  packages/
    shared/       Domain constants and pure utilities (exists)
  docs/           Architecture, roadmap, decision records
```

## Stack decisions

| Area     | Choice                                     | Why                                                                |
| -------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Language | TypeScript everywhere                      | One language across web, API, mobile; shared types and rules.      |
| Web      | Next.js 15, React 19                       | Already chosen in the repo.                                        |
| Backend  | NestJS, REST + OpenAPI                     | Structured modules, guards and DI suit RBAC and tenancy.           |
| Database | PostgreSQL                                 | Constraints, transactions, row-level security.                     |
| ORM      | Prisma (to confirm in Phase 2)             | Migrations and typed client. Revisit if raw SQL needs grow.        |
| Mobile   | Expo (React Native)                        | Cloud builds through EAS, so no local Android toolchain needed.    |
| Desktop  | Tauri                                      | Small installers, reuses the web UI.                               |
| Styling  | Tailwind CSS, added with the design system | Not added yet on purpose, to avoid unused dependencies in Phase 1. |
| CI       | GitHub Actions                             | Everything builds in the cloud.                                    |

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
  money helpers including a GST split. Covered by unit tests.
- `apps/web`: buildable Next.js app with a status page and `/api/health`. No product features yet.
- CI: format check, lint, typecheck, tests, build, dependency audit.

## Open decisions

These need an answer before the phase that depends on them.

1. **Hosting and database provider** (before Phase 2 goes live): affects cost.
2. **Email, SMS and WhatsApp providers** (Phase 4): WhatsApp needs an official Business API account.
3. **Payment gateway** (Phase 5): Razorpay for India, Stripe for international is the likely pair.
4. **Expo account** (Phase 6): needed for cloud Android builds.
