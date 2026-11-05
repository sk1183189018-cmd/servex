# Roadmap and status

Status key: `done` means the code exists and its checks have actually run. `in progress`, `planned`
and `blocked` mean what they say. Nothing is marked done on faith.

## Phase 0: Repository inspection

- [x] Inspect existing repo (README, root package.json, empty `apps/web` shell, `.gitignore` added)
- [x] Architecture written down (`docs/ARCHITECTURE.md`)

## Phase 1: Foundation (in progress)

- [x] pnpm workspace, TypeScript base config, Prettier, ESLint
- [x] `packages/shared`: roles, permissions, job statuses, money and GST helpers
- [x] Unit tests for shared package
- [x] `apps/web` buildable skeleton with `/api/health`
- [x] GitHub Actions CI and Dependabot
- [ ] First green CI run on GitHub (check after push)

## Phase 2: Backend foundation (planned)

Database and migrations, authentication, organizations and tenants, roles and permissions store,
audit logging, tenant isolation tests.

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
