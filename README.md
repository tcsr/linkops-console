# RADWIN LinkOps Console

A monorepo for a radio-link operations console: a fleet dashboard with live
telemetry, status derivation, and link management. Built as an Nx workspace with
strict, enforced architectural boundaries between a framework-independent domain
core, data-access layers, feature layers, and the two applications (`api`, `console`).

> **Milestone:** M3 — REST API
> **Status:** Implementation complete / pending review
>
> The domain, in-memory persistence, the 1 Hz telemetry simulator, and a real
> NestJS REST API are implemented. There is still no SSE or UI — those arrive in
> later milestones.
>
> **AI usage:** parts of this codebase were implemented with AI assistance
> (Claude Code) under human direction and review; all commits are authored by the
> repository owner.

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

Run the API (NestJS REST server; seeds the fleet and starts the 1 Hz simulator):

```bash
npx nx serve @linkops/api
```

Expected output:

```
[linkops-api] M3 REST API listening on :3000
```

The port is configurable via `PORT`. SIGINT/SIGTERM shut down through the Nest
lifecycle (simulator timer stopped, app closed) — no abrupt `process.exit`.

### REST endpoints (M3)

| Method & path | Purpose |
| ------------- | ------- |
| `GET /links` | List links (filter `band`/`mode`/`search`/`status`, sort `sort`+`order`). Each item includes derived `status` + `latestSample`. |
| `GET /links/:id` | Single link view. |
| `POST /links` | Create (201). |
| `PATCH /links/:id` | Partial update; body requires `expectedVersion` (optimistic concurrency). |
| `DELETE /links/:id` | Delete (204). |
| `GET /links/:id/telemetry?windowMs=` | Telemetry window from the ring buffer (default 5 min). |
| `GET /fleet/summary` | Domain `FleetSummary` (counts, avg throughput, worst link). |

Validation is at the HTTP boundary (`class-validator` DTOs + a global
`ValidationPipe`); domain models carry no framework decorators. Status codes:
**400** validation / malformed id / bad name, **404** not found, **409** version
conflict or duplicate name.

**Error envelope** (implementation decision — M0 does not define one):

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "...", "statusCode": 409,
             "timestamp": "2025-06-01T00:00:00.000Z", "path": "/links/link-0001",
             "details": { "expectedVersion": 99, "actualVersion": 2 } } }
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
| **M1** | Domain + in-memory store | ✅ complete |
| **M2** | Telemetry simulator (1 Hz) | ✅ complete |
| **M3** | REST API (NestJS controllers, DTOs, validation, error envelope) | ✅ implementation complete / pending review |
| M4 | SSE stream + client | ⏳ not started |
| M5 | Fleet view UI | ⏳ not started |
| M6 | Link detail + edit UI | ⏳ not started |
| M7 | Concurrency / error UX | ⏳ not started |
| M8 | Tests beyond current scope | ⏳ not started |

### Telemetry simulator (M2)

- Runs at **1 Hz** — one global `setInterval` for the whole fleet.
- Generates **one `TelemetrySample` per link per tick** (`linkId`, `ts`,
  `rssiDbm`, `snrDb`, `throughputMbps`), appended to each link's **300-sample
  ring buffer** (bounded ≈ 5 min of history; no unbounded growth).
- **Plausible drift:** values evolve by bounded random-walk toward a target and
  stay within realistic ranges; throughput stays within link capacity.
- **Occasional degradation:** episodes push a link's telemetry into the degraded
  band for a bounded number of ticks, then recover (with cooldown) — never all
  links at once, never permanently.
- **Status stays derived** via `deriveLinkStatus(link, latestSample, now)`; the
  simulator never writes a status field.
- Simulation state is **O(fleet)** (scalars per link); telemetry lives only in
  the repository ring buffers.

See [`docs/architecture/telemetry.md`](docs/architecture/telemetry.md).

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

### Completed in M2

- 1 Hz `TelemetrySimulatorService` in `libs/api-data-access` (one global timer).
- `TelemetrySample` extended with `rssiDbm` (assignment sample contract).
- Plausible bounded drift, occasional degradation + recovery — status stays derived.
- Deterministic simulator tests (injected clock + RNG; no real-time sleeps).
- Telemetry architecture doc; simulator wired into the API composition shell.

### Completed in M3

- Real NestJS REST API in `libs/api-feature` (controllers, DTOs, services,
  global validation pipe, global exception filter + consistent error envelope).
- CRUD + filtering + sorting + telemetry + fleet-summary endpoints, all through
  the repository abstraction (controllers never touch Map/RingBuffer internals).
- `TelemetrySimulatorService` hardened + wired as a NestJS provider: non-overlapping
  ticks, contained tick errors, Nest-owned startup/shutdown, graceful SIGTERM/SIGINT.
- Real NestJS integration tests (`@nestjs/testing` + supertest).
- REST architecture doc.

### Not yet implemented

- M4 SSE stream/client, EventBus, and reconnect logic
- M5 fleet UI · M6 detail/edit UI · M7 concurrency & error UX
- Angular console app, MongoDB, Docker/K8s, and all other M4+ concerns
