# RADWIN LinkOps Console

A monorepo for a radio-link operations console: a fleet dashboard with live
telemetry, status derivation, and link management. Built as an Nx workspace with
strict, enforced architectural boundaries between a framework-independent domain
core, data-access layers, feature layers, and the two applications (`api`, `console`).

> **Milestone:** M1 — Domain + In-Memory Store
> **Status:** Implementation complete / pending review
>
> Only the domain and in-memory persistence layers are implemented. There is no
> HTTP server, telemetry simulator, or UI yet — those arrive in later milestones.

---

## Prerequisites

Verified with the versions used to build M1:

| Tool | Version |
| ---- | ------- |
| Node.js | 24.x (built with 24.15.0) |
| npm | 11.x (built with 11.14.1) |
| Nx | 23.1.1 (pinned as a dev dependency; run via `npx nx`) |

TypeScript is pinned in the workspace; no global install is required.

## Install

```bash
npm install
```

## Common commands

All tasks run through Nx. `run-many` fans out across every project.

```bash
# Run all unit tests
npx nx run-many -t test

# Type-check every project (tsc --build, emitDeclarationOnly)
npx nx run-many -t typecheck

# Lint every project (includes enforced module boundaries)
npx nx run-many -t lint

# Build every project
npx nx run-many -t build
```

Convenience npm scripts mirror these: `npm test`, `npm run typecheck`,
`npm run lint`, `npm run build`.

Run the API composition shell (M1: seeds the fleet and logs a line — no HTTP yet):

```bash
npx nx serve @linkops/api
```

Expected output:

```
[linkops-api] M1 shell ready — seeded 10 links (no HTTP server yet).
```

> **Nx sync:** this workspace uses TypeScript project references. After changing
> cross-project imports, run `npx nx sync` to keep `tsconfig` references in sync.

---

## Project structure

```
apps/
  api/        Node application shell (scope:api,     type:app)   — composition only in M1
  console/    Console application shell (scope:console, type:app) — placeholder in M1

libs/
  domain/               Framework-independent domain core (scope:shared, type:domain)
  api-data-access/      In-memory repository + ring buffer (scope:api,   type:data-access)
  api-feature/          (shell) API feature layer          (scope:api,   type:feature)
  console-data-access/  (shell) Console data access         (scope:console, type:data-access)
  console-feature/      (shell) Console feature layer        (scope:console, type:feature)
  console-ui/           (shell) Presentational components     (scope:console, type:ui)

docs/architecture/      System overview + dependency graph
```

For M1, real implementation lives only in `libs/domain` and `libs/api-data-access`.
The other libraries are intentionally minimal shells that exist so their Nx tags
and the dependency boundaries are real and enforced from day one.

## Architecture overview

The domain layer owns the vocabulary and rules and depends on **nothing** — no
Angular, NestJS, RxJS, Express, or Node/browser APIs. It exports:

- **Types:** `LinkId` (branded), `Link`, `TelemetrySample`, `FleetSummary`,
  `Band`, `LinkMode`, `ChannelWidth`, `LinkStatus`, and CRUD input/query types.
- **`deriveLinkStatus(link, latest, now)`** — a pure function returning
  `'up' | 'degraded' | 'down'`; `now` is injected so derivation is deterministic.
- **Domain errors:** `LinkNotFoundError`, `VersionConflictError`,
  `InvalidLinkIdError`, `InvalidLinkNameError`, `DuplicateLinkNameError`
  (framework-independent; no HTTP mapping yet).
- **`LinkRepository`** — the persistence contract (async CRUD so a durable
  implementation can replace the in-memory one without touching call sites).

`api-data-access` provides `InMemoryLinkRepository` (a `Map<LinkId, Link>` plus a
bounded `RingBuffer` of telemetry per link) and deterministic seed data.

See [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md)
and [`docs/architecture/dependency-graph.md`](docs/architecture/dependency-graph.md).

## Dependency rules

Enforced by `@nx/enforce-module-boundaries` (a lint error on violation):

| Layer | May depend on |
| ----- | ------------- |
| `type:domain` | *nothing* |
| `type:data-access` | `type:domain` |
| `type:feature` | `type:domain`, `type:data-access`, `type:ui` |
| `type:ui` | `type:domain` |
| `type:app` | feature / data-access / ui / domain |

Plus scope isolation: `scope:api` and `scope:console` may never depend on each
other; both may depend on `scope:shared` (the domain).

---

## Milestone progress

| Milestone | Description | Status |
| --------- | ----------- | ------ |
| **M1** | Domain + in-memory store | ✅ implementation complete / pending review |
| M2 | Telemetry simulator + 1 Hz timer + EventBus | ⬜ not started |
| M3 | REST API (controllers, DTOs, validation, error mapping) | ⬜ not started |
| M4 | SSE stream + client | ⬜ not started |
| M5 | Fleet view UI | ⬜ not started |
| M6 | Link detail + edit UI | ⬜ not started |
| M7 | Concurrency / error UX | ⬜ not started |
| M8 | Tests beyond M1 scope | ⬜ not started |

### Completed in M1

- Nx workspace with enforced library boundaries and tags.
- Framework-independent domain: branded `LinkId`, domain types, `deriveLinkStatus`,
  domain errors, `LinkRepository` contract.
- `InMemoryLinkRepository` with optimistic version handling and unique,
  length-constrained (3–40) link names.
- Bounded telemetry ring buffer (300 samples/link ≈ 5 min at 1 Hz).
- Deterministic 10-link seed fleet.
- Domain, repository, and ring-buffer unit tests (deterministic, injected time).
- This README and initial architecture docs.

### Not yet implemented

- M2 telemetry simulator / timer / EventBus
- M3 REST controllers, DTOs, validation, HTTP error mapping
- M4 SSE and reconnect logic
- M5 fleet UI · M6 detail/edit UI · M7 concurrency & error UX
- Angular console app, MongoDB, Docker/K8s, and all other M2+ concerns
