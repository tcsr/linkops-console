# RADWIN LinkOps Console

A monorepo for a radio-link operations console: a fleet dashboard with live
telemetry, status derivation, and link management. Built as an Nx workspace with
strict, enforced architectural boundaries between a framework-independent domain
core, data-access layers, feature layers, and the two applications (`api`, `console`).

> **Milestone:** M7 — Concurrency + error handling (delete, 409 resolution)
> **Status:** Implementation complete / pending review
>
> The domain, in-memory persistence, the 1 Hz telemetry simulator, a real NestJS
> REST API, a live SSE stream (`GET /api/stream`), the **Angular 22 fleet view**
> (zoneless, signal-first; live status + throughput, KPI header, URL-backed
> filter/sort), the **M6 link detail view** (live hand-rolled SVG sparkline)
> plus the **validated create/edit form** (client validation mirrors the server
> rules), and the **M7 concurrency/error UX** — inline **delete confirmation**,
> optimistic-concurrency **409 conflict resolution** (reload-latest → re-apply →
> retry), and readable failure messaging across delete/save/reload — are
> implemented.
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

### Run it (API + Angular client together)

One documented command starts both the NestJS API and the Angular console:

```bash
npm run dev
```

- **API:** http://localhost:3000 — `[linkops-api] … listening on :3000`.
- **Console:** http://localhost:4200 — the Angular console (the dev server
  proxies `/links`, `/fleet`, and `/api` to the API, per
  `apps/console/proxy.conf.cjs`; its bypass serves the SPA for HTML navigations
  so client routes like `/links/:id` deep-link and refresh correctly).

A **working first load** at http://localhost:4200: the **KPI header** shows
**10** seeded links (up/degraded/down counts + avg Mbps), the **list** shows all
10 links with a live status badge and current throughput, the connection
indicator reads **open**, and **throughput values update ~once per second** as
the simulator streams telemetry. Filtering/sorting (search, status, band, sort,
order) is reflected in the URL, so a filtered view is shareable and survives
reload.

**Link detail + edit (M6):** click a link name to open `/links/:id` — its
configuration, live status, a hand-rolled SVG **throughput sparkline**, and the
current RSSI/SNR/throughput, updating live over the same SSE stream. **+ New
link** (`/links/new`) and **Edit** (`/links/:id/edit`) open a validated form
whose rules mirror the server's; on save it returns to the link's detail. Editing
carries the link's `version` for optimistic concurrency.

**Delete + conflict handling (M7):** the detail view has an inline **Delete** →
**Confirm/Cancel** flow; a confirmed delete removes the link (`DELETE` → 204),
prunes it from the live fleet, and returns to the fleet. If the edited link was
changed elsewhere, the save returns **409 `VERSION_CONFLICT`** and the form shows
a conflict banner with **Reload latest** — load the current server state, re-apply
your change, and Save again (the retry carries the fresh `expectedVersion`). A
stale save is blocked until you reload. Delete/save/reload failures (network, 404,
5xx) surface as readable messages, never a silent no-op or a bare console error.

Run each separately with `npm run dev:api` and `npm run dev:console`.

The API port is configurable via `PORT`. SIGINT/SIGTERM shut the API down
through the Nest lifecycle (simulator timer stopped, app closed) — no abrupt
`process.exit`.

### REST endpoints (M3)

| Method & path | Purpose |
| ------------- | ------- |
| `GET /links` | List links (filter `band`/`mode`/`search`/`status`, sort `sort`+`order`). Each item includes derived `status` + `latestSample`. |
| `GET /links/:id` | Single link view. |
| `POST /links` | Create (201). |
| `PATCH /links/:id` | Partial update; body requires `expectedVersion` (optimistic concurrency). |
| `DELETE /links/:id` | Delete (204); **404** if unknown. No version parameter, so it never returns the optimistic-concurrency 409. |
| `GET /links/:id/telemetry?windowMs=` | Telemetry window from the ring buffer (default 5 min). |
| `GET /fleet/summary` | Domain `FleetSummary` (counts, avg throughput, worst link). |

### Live stream (M4)

| Method & path | Purpose |
| ------------- | ------- |
| `GET /api/stream` | SSE (`text/event-stream`). Events: `link.telemetry` (per sample), `link.status` (on transition, `{linkId,status,previous}`), `fleet.summary` (once per tick). |

Live-only reconnect (native `EventSource`; no server-side replay) — historical
gaps are recovered via `GET /links/:id/telemetry`. Routing note: `/api/stream` is
served literally without adding a global `/api` prefix, so the M3 routes above
stay unprefixed. Full design: [`docs/architecture/sse.md`](docs/architecture/sse.md).

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
  api-data-access/      In-memory repo + ring buffer + simulator (scope:api, type:data-access)
  api-feature/          NestJS REST + SSE stream layer      (scope:api,     type:feature)
  console-data-access/  Signal store: REST + SSE + coalescing (scope:console, type:data-access)
  console-feature/      Fleet view container (routed)        (scope:console, type:feature)
  console-ui/           Presentational components            (scope:console, type:ui)

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
| **M3** | REST API (NestJS controllers, DTOs, validation, error envelope) | ✅ complete |
| **M4** | Live stream over SSE (backend `GET /api/stream`) | ✅ complete |
| **M5** | Angular fleet view (live status/throughput, KPI header, URL filter/sort) | ✅ complete |
| **M6** | Link detail (live sparkline) + validated create/edit form | ✅ complete |
| **M7** | Concurrency / error UX (409 resolution, delete confirmation, failure messaging) | ✅ implementation complete / pending review |
| **M8** | Tests that mean something (backend unit + HTTP contract test; frontend store + component tests) | ✅ requirement satisfied |

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

### Completed in M4 (backend SSE)

- `TelemetrySink` — a framework-free **domain port** so the simulator hands off
  each completed tick batch without any RxJS/NestJS coupling.
- `FleetEvent` / `FleetEventBus` (RxJS `Subject`) / `TelemetryStreamService` /
  `StreamController` in `libs/api-feature`: the app/transport streaming layer.
- `GET /api/stream` (`text/event-stream`) emitting `link.telemetry` (per sample),
  `link.status` (on transition), `fleet.summary` (once per tick).
- Independent per-connection subscriptions with framework-managed disconnect
  cleanup; serialized batch processing (deterministic ordering, failure-tolerant);
  live-only reconnect (no replay); delete-while-streaming handled; graceful
  stream completion on shutdown.
- Unit + real end-to-end SSE integration tests (real Nest wiring, real socket).
- SSE architecture doc ([`docs/architecture/sse.md`](docs/architecture/sse.md)).

### Completed in M5 (Angular fleet view)

- Angular 22 client — **zoneless** (`provideZonelessChangeDetection()`, no
  zone.js; bonus B3), **standalone**, **signal-first**.
- `console-data-access`: `FleetStore` signal store — REST snapshot (`/links` +
  `/fleet/summary`) + `EventSource` on `/api/stream`, with **render coalescing**
  (SSE events buffered and applied once per animation frame → no 1 Hz
  change-detection storm), live-only reconnect, and `DestroyRef` teardown.
- `console-ui`: presentational `StatusBadge`, `KpiHeader`, `FleetTable`
  (`@for … track id`), on a domain-typed view-model.
- `console-feature`: `FleetView` — KPI header + sortable/filterable live list;
  **filter/sort state in the URL** (shareable, survives reload); loading / error
  / empty / ready states.
- One-command dev startup (`npm run dev`) with an API proxy.
- Tests: signal store + state logic + component tests (zoneless
  jest-preset-angular). See [`docs/architecture/console.md`](docs/architecture/console.md).

### Completed in M6 (Angular link detail + edit)

- `console-data-access`: `LinkDetailStore` — per-link REST snapshot + telemetry
  history, folding **live** telemetry/status by reading the already-coalesced
  `FleetStore` (no second `EventSource` or scheduler); bounded 60-point series;
  typed error-envelope parser (`parseApiError`) and REST client methods
  (`linkById`, `telemetry`, `create`, `update`).
- `console-ui`: dependency-free hand-rolled **SVG `Sparkline`**; `FleetTable` row
  selection (router-agnostic `rowSelect`).
- `console-feature`: `LinkDetailView` (`/links/:id`) and the typed reactive
  `LinkFormView` (`/links/new`, `/links/:id/edit`) whose validators mirror the
  shared domain rules; save-in-progress + duplicate-submit guards; edit sends
  `expectedVersion`.
- `domain`: shared validation constants (bands/modes/widths + numeric ranges) so
  client and server validate against one source.
- Routing with deep-link/refresh support (component-input binding + proxy
  bypass). Verified end-to-end in the browser (fleet → detail → history +
  sparkline → edit → save → updated state).

### Completed in M7 (concurrency + error handling)

- `console-data-access`: `FleetApi.delete` (`DELETE /links/:id`), `FleetStore.removeLink`
  (local row pruning — the M4 stream carries no `link.deleted` event, so a deleting
  client prunes the row instead of refetching), and `LinkDetailStore.deleteLink`
  (owns transport/state: `deleting`/`deleteError`; 404 treated as already-gone).
- `console-feature`: inline **delete confirmation** in `LinkDetailView` (Delete →
  Confirm/Cancel; deleting state disables the confirm; navigation to the fleet on
  success — the store already pruned the row). **409 `VERSION_CONFLICT`** resolution
  in `LinkFormView`: conflict banner + **Reload latest** (re-prefill + fresh
  `version`), stale-save blocked, explicit retry with the new `expectedVersion`;
  `DUPLICATE_LINK_NAME` (also 409) stays an ordinary save error.
- Readable failure messaging across delete/save/reload (network, 404, 5xx) via the
  shared `parseApiError` — no new backend contract, no SSE change.
- **Delete-while-streaming** safety: a pruned row is not resurrected by late SSE
  frames (`applyEvents` ignores events for absent rows); remaining links keep
  updating live. Verified in the browser with a real two-tab 409 and a live delete.
- Store/view/API unit tests across the delete transport, confirmation UX, and 409
  resolution flow. Full design: [`docs/architecture/console.md`](docs/architecture/console.md).

### Not yet implemented

- MongoDB, Docker/K8s, and all other later concerns
- Bonus items B2/B2a (A2UI), B4 (Module Federation), B5 (perf budgets)
