# Roadmap and status

Status key: `done` means the code exists and its checks have actually run. `in progress`, `planned`
and `blocked` mean what they say. Nothing is marked done on faith.

## Phase 0: Repository inspection

- [x] Inspect existing repo (README, root package.json, empty `apps/web` shell, `.gitignore` added)
- [x] Architecture written down (`docs/ARCHITECTURE.md`)

## Phase 1: Foundation

- [x] pnpm workspace, TypeScript base config, Prettier, ESLint
- [x] `packages/shared`: roles, permissions, job statuses, money and GST helpers
- [x] Unit tests for shared package
- [x] `apps/web` buildable skeleton with `/api/health`
- [x] GitHub Actions CI and Dependabot
- [x] CI workflow (a green run is recorded in the pull request that merged Phase 2)

## Phase 2: Backend foundation (in progress)

Done (code exists and its tests have run against a real PostgreSQL):

- [x] Schema and SQL migrations (Drizzle), including row-level security and an append-only audit log
- [x] Sign-up (company + owner + head-office branch in one transaction), login, account lockout
- [x] Short-lived access token plus rotating refresh token with reuse detection, logout
- [x] Role and permission enforcement on the server, deny by default, changes effective immediately
- [x] Tenant isolation proven at API level and database level (and the tests were shown to fail when
      the protection is removed)
- [x] Audit logging for sign-up, login events, member changes, settings and customer changes
- [x] Organization settings, member list, role and status changes with escalation and last-owner rules
- [x] Customers module (create, read, update, soft delete, search, sort, pagination)
- [x] Platform admin bootstrap script (`pnpm --filter @servex/api admin:create`)

Not done yet in Phase 2 (planned next):

- [ ] Email verification, password reset and member invitations (needs an email provider, see open decisions)
- [ ] Two-factor authentication
- [ ] Custom roles and editable permissions per company (defaults only today)
- [ ] Branch management endpoints (a head-office branch is created, no API yet)
- [ ] Session list and "sign out everywhere"
- [ ] OpenAPI document served by the API
- [ ] Redis-backed rate limiting (in-memory today, fine for one instance only)

## Phase 3: Web application (planned)

Design system, login and onboarding, dashboard, navigation, CRM, bookings and work orders.

## Phase 4: Operations (planned)

Technicians, dispatch, inventory, billing, AMC and warranty, notifications.

## Phase 5: Customer experience (planned)

Customer portal, booking, job tracking, quotations and payments.

## Phase 6: Android (planned)

Expo app, technician and customer flows, offline sync, push notifications, APK and AAB cloud builds.

## Phase 7: AI and analytics (planned)

AI provider abstraction, assistant, reports, forecasting.

## Phase 8: Desktop (planned)

Tauri packages for Windows and macOS, update strategy.

## Phase 9: Production readiness (planned)

Security review, performance tests, backups, monitoring, staging and production release checklist.

## Blocked / needs input from the owner

Nothing blocking right now. See "Open decisions" in `docs/ARCHITECTURE.md` for what will be needed later.
