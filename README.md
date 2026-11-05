# servex

Global Enterprise Service Management Operating System: CRM, work orders, dispatch, inventory,
billing and AMC for service and repair companies.

**Status: early foundation.** There is no login or working product module yet. See
[docs/ROADMAP.md](docs/ROADMAP.md) for what is done and what is next.

## Layout

| Path              | What it is                                                   |
| ----------------- | ------------------------------------------------------------ |
| `apps/web`        | Next.js web app                                              |
| `packages/shared` | Roles, permissions, job statuses, decimal-safe money helpers |
| `docs`            | Architecture and roadmap                                     |

More apps (`api`, `mobile`, `desktop`) arrive in later phases. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Working on it

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm dev          # web app on http://localhost:3000
pnpm check        # lint, typecheck, test, build
```

CI runs the same checks on every push and pull request. Copy `.env.example` to `.env.local` for local
settings and never commit real secrets.
