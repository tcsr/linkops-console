# RADWIN LinkOps Console

[![CI](https://github.com/tcsr/linkops-console/actions/workflows/ci.yml/badge.svg)](https://github.com/tcsr/linkops-console/actions/workflows/ci.yml)

## 1. What this is

LinkOps Console is an operator console for a fleet of point-to-point radio links.
An operator sees every link with its live status and throughput, spots degraded
links immediately, drills into one link to watch its telemetry, and edits link
configuration. Telemetry is produced by a simulator inside the API — there is no
real hardware and no external service; everything runs locally, in memory.

It is built as an **Nx monorepo** with strict, enforced boundaries between a
framework-independent domain core, data-access layers, feature layers, and two
thin app shells (`api`, `console`): **Angular 22** (zoneless, signal-first) on the
front end, **NestJS 11** on the back end, and a live **SSE** stream between them.

**Status:** the required scope **M1–M8 is complete**, plus bonuses **B1** (Nx
workspace with enforced boundaries), **B3** (zoneless + signal-first), and **B6**
(CI workflow + ADRs + conventional commits). A2UI (B2/B2a), Module Federation
(B4), and performance budgets (B5) are deliberately not implemented — see
[§12](#12-decisions-gaps-and-next-steps).

## 2. Prerequisites

A committed [`.nvmrc`](.nvmrc) pins the exact Node version. With `nvm`, run
`nvm use` in the repo root.

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | **24.15.0** | pinned in [`.nvmrc`](.nvmrc) |
| npm | **11.14.1** | ships with the Node above |
| Nx | 23.1.1 | a dev dependency; run via `npx nx` (no global install) |

TypeScript is pinned in the workspace. Nothing else needs to be installed
globally. No database, Docker, or cloud service is required — all state is in
memory.

## 3. Install

```bash
npm install
```

That is the only install step. There is **no** separate library build to run
before tests or the app: Jest and the dev server resolve the `@linkops/*`
workspace packages to their TypeScript source, so a fresh `git clone` +
`npm install` is immediately testable and runnable.

## 4. Configuration

The application needs **no secrets** and runs with **zero configuration**. Every
variable is optional with a sensible default.

| Variable | What it does | Required | Default | Example |
| -------- | ------------ | -------- | ------- | ------- |
| `PORT` | Port the NestJS API listens on (the Angular dev server proxies to it). | No | `3000` | `PORT=4000` |

A committed [`.env.example`](.env.example) documents the above; copy it to a local
`.env` only to override a default. `.env` is gitignored.

**A2UI credentials (B2/B2a):**

```text
B2 A2UI: Not implemented.
B2a A2UI credentials: Not applicable because B2 is not implemented.
The current application requires no AI credentials.
.env.example contains only actual application configuration.
No secrets are committed.
```

## 5. Run it

One documented command starts both the NestJS API and the Angular console:

```bash
npm run dev
```

- **API:** http://localhost:3000 — logs `[linkops-api] … listening on :3000`.
- **Console:** http://localhost:4200 — the Angular console. The dev server proxies
  `/api` to the API (see [`apps/console/proxy.conf.cjs`](apps/console/proxy.conf.cjs));
  its bypass serves the SPA for HTML navigations so client routes like `/links/:id`
  deep-link and refresh correctly.

Run each side separately with `npm run dev:api` and `npm run dev:console`.

**A working first load** at http://localhost:4200: the **KPI header** shows **10**
seeded links (up/degraded/down counts + average Mbps), the **list** shows all 10
links with a live status badge and current throughput, the connection indicator
reads **open**, and **throughput values update ~once per second** as the simulator
streams telemetry. Filter/sort state (search, status, band, sort, order) lives in
the URL, so a filtered view is shareable and survives reload.

**Link detail + edit (M6):** click a link name to open `/links/:id` — its
configuration, live status, a hand-rolled SVG **throughput sparkline**, and the
current RSSI/SNR/throughput, all updating live over the same SSE stream. **+ New
link** (`/links/new`) and **Edit** (`/links/:id/edit`) open a validated form whose
rules mirror the server's; on save it returns to the link's detail. Editing
carries the link's `version` for optimistic concurrency.

**Delete + conflict handling (M7):** the detail view has an inline **Delete → Confirm/Cancel**
flow. `204` removes the link and returns to the fleet; `404` means it is already
gone and completes the same flow (not an error); network/`5xx` shows a readable
message and lets you retry. For editing, a stale save returns **409 `VERSION_CONFLICT`**:
the form shows a conflict banner with **Reload latest** — load current server
state, re-apply your change, and Save again (the retry carries the fresh
`expectedVersion`). Failures surface as readable messages — never a silent no-op
or a bare console error.

The API port is configurable via `PORT`. SIGINT/SIGTERM shut the API down through
the Nest lifecycle (simulator timer stopped, app closed) — no abrupt
`process.exit`.

## 6. Test it

All tasks run through Nx; `run-many` fans out across every project.

```bash
npm test              # all unit + integration tests (npx nx run-many -t test)
npm run typecheck     # tsc --build across every project
npm run lint          # eslint incl. enforced @nx/enforce-module-boundaries
npm run build         # build every project
```

**One project** (fast inner loop):

```bash
npx nx test @linkops/console-feature
```

**A single test file** while developing:

```bash
npx nx test @linkops/api-feature --testFile=api.integration.spec.ts
# or drive Jest directly:  npx nx test @linkops/api-feature -- -t "returns 409"
```

Tests run straight from a clean checkout — `npm test` needs **no** prior build.
The full suite (currently **225 tests across 6 projects**) runs in well under a
minute. What is covered: domain status-derivation and repository unit tests, a
real NestJS HTTP-contract integration test (`@nestjs/testing` + supertest), a real
end-to-end SSE socket test, and Angular store/state + component tests (zoneless
`jest-preset-angular`).

The same four gates run in **CI** on every push and PR to `main`
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

> **Known non-blocking noise:** production builds emit a CSS budget *warning* (not
> an error); the SSE socket test may print a Jest "worker failed to exit
> gracefully" note on teardown; `npm audit` reports transitive advisories. None
> fail the suite or the build.

## 7. Project structure

```
apps/
  api/        NestJS application shell   (scope:api,     type:app)  — composition/bootstrap
  console/    Angular application shell  (scope:console, type:app)  — routes + proxy

libs/
  domain/               Framework-independent domain core        (scope:shared,  type:domain)
  api-data-access/      In-memory repo + ring buffer + simulator (scope:api,     type:data-access)
  api-feature/          NestJS REST + SSE stream layer           (scope:api,     type:feature)
  console-data-access/  Signal stores: REST + SSE + coalescing   (scope:console, type:data-access)
  console-feature/      Routed containers (fleet/detail/form)    (scope:console, type:feature)
  console-ui/           Presentational components                (scope:console, type:ui)

docs/architecture/   System/REST/SSE/telemetry/console design docs
docs/adr/            Architecture Decision Records
```

**Dependency rule** — enforced by `@nx/enforce-module-boundaries` (a lint error on
violation), so a new feature has exactly one correct home:

| Layer (`type:`) | May depend on |
| --------------- | ------------- |
| `domain` | *nothing* |
| `data-access` | `domain` |
| `feature` | `domain`, `data-access`, `ui` |
| `ui` | `domain` |
| `app` | feature / data-access / ui / domain |

Plus scope isolation: `scope:api` and `scope:console` may never depend on each
other; both may depend only on `scope:shared` (the domain). Dependency direction
points one way, toward the domain, which imports nothing framework-specific. See
[ADR 0001](docs/adr/0001-enforced-nx-library-boundaries.md).

## 8. How it works

End-to-end flow (telemetry out, user actions in). Detailed design lives in
[`docs/architecture/`](docs/architecture); this is the map.

```
                    ┌───────────────────────── browser (Angular 22, zoneless) ─────────────────────────┐
                    │  FleetView / LinkDetailView / LinkFormView   (standalone components, signals)     │
                    │            │  read signals                        │ user actions                  │
                    │      FleetStore / LinkDetailStore  ───────────────┘ (create/edit/delete)          │
                    └──────┬─────────────────────▲──────────────────────────────┬─────────────────────-┘
              EventSource  │ SSE (live)          │ REST snapshot                │ REST mutations
              GET /api/stream                    │ GET /api/links, …            │ POST/PATCH/DELETE /api/links
                           ▼                     │                              ▼
        ┌──────────────────────────────── NestJS API (global prefix /api) ────────────────────────────┐
        │  StreamController @Sse('stream')        LinksController / FleetController (thin)             │
        │        ▲  FleetEventBus (RxJS Subject)          │  LinksService / FleetService              │
        │        │                                        ▼                                           │
        │  TelemetryStreamService  ◄── TelemetrySink ──  LinkRepository (interface, @linkops/domain)   │
        │        ▲                                        │                                           │
        │  TelemetrySimulator (1 Hz) ────────────────►  InMemoryLinkRepository: Map<LinkId,Link>      │
        │                                                 + per-link bounded RingBuffer (300 samples)  │
        └────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Telemetry out:** the simulator ticks at 1 Hz, writes each sample to the
  repository ring buffer **and** hands the batch to `TelemetrySink` →
  `TelemetryStreamService` derives status (`deriveLinkStatus`) → `FleetEventBus` →
  `@Sse('stream')` (served at `/api/stream`). The client `FleetStore` owns the
  single `EventSource` and applies buffered events **once per animation frame** (no
  1 Hz change-detection storm). See [ADR 0002](docs/adr/0002-angular-zoneless-signal-first.md).
- **Where status is derived:** server-side only, on demand, by the pure
  `deriveLinkStatus(link, latestSample, now)`. It is never stored and never set by
  the client.
- **Where client state lives:** in signal stores (`FleetStore`, `LinkDetailStore`)
  in `console-data-access`; components read signals and never call `HttpClient`
  directly.
- **Actions in:** components call stores → `FleetApi` (REST). Validation is
  enforced on both sides (client validators mirror the shared domain rules; the
  server re-enforces them).
- **On reconnect:** the native `EventSource` reconnects live-only (no server-side
  replay); history gaps are recovered via `GET /api/links/:id/telemetry`. See
  [ADR 0003](docs/adr/0003-sse-live-only-no-replay.md).

## 9. API reference

All routes are served under a single global `/api` prefix
([ADR 0004](docs/adr/0004-single-global-api-prefix.md)).

### REST (M3)

| Method & path | Purpose |
| ------------- | ------- |
| `GET /api/links` | List links (filter `band`/`mode`/`search`/`status`, sort `sort`+`order`). Each item includes derived `status` + `latestSample`. |
| `GET /api/links/:id` | Single link view (link + derived `status` + current telemetry snapshot). |
| `POST /api/links` | Create (201) and return the created link. |
| `PATCH /api/links/:id` | Partial update; body requires `expectedVersion` (optimistic concurrency); mismatch → 409. |
| `DELETE /api/links/:id` | Delete (204); **404** if unknown. No version parameter, so it never returns the optimistic-concurrency 409. |
| `GET /api/links/:id/telemetry?windowMs=` | Telemetry window from the ring buffer (default 5 min). |
| `GET /api/fleet/summary` | Domain `FleetSummary` (counts, avg throughput, worst link). |

Validation is at the HTTP boundary (`class-validator` DTOs + a global
`ValidationPipe` with `whitelist`/`forbidNonWhitelisted`/`transform`); domain
models carry no framework decorators. Status codes: **400** validation / malformed
id / bad name, **404** not found, **409** version conflict or duplicate name.

### SSE (M4)

| Method & path | Purpose |
| ------------- | ------- |
| `GET /api/stream` | `text/event-stream`. Events: `link.telemetry`, `link.status`, `fleet.summary`. |

Example frames:

```text
event: link.telemetry
data: {"linkId":"link-0001","ts":"2026-08-05T09:00:01.000Z","rssiDbm":-62,"snrDb":21,"throughputMbps":184}

event: link.status
data: {"linkId":"link-0001","status":"degraded","previous":"up"}

event: fleet.summary
data: {"total":10,"up":6,"degraded":3,"down":1,"avgThroughputMbps":142.5,"worstLinkId":"link-0007"}
```

The stream pushes **every** sample as `link.telemetry`, a `link.status` frame only
on a status **transition**, and one `fleet.summary` per tick; the client coalesces
these to one repaint per animation frame. Live-only reconnect (native
`EventSource`, no server replay) — historical gaps are recovered via
`GET /api/links/:id/telemetry`.

### Error envelope

One shape for every failure; the HTTP status carries the class, `code` carries the
meaning:

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Link was modified by someone else",
             "statusCode": 409, "timestamp": "2026-06-01T00:00:00.000Z",
             "path": "/api/links/link-0001",
             "details": { "expectedVersion": 99, "actualVersion": 2 } } }
```

Codes: `VALIDATION_FAILED` (400), `INVALID_LINK_ID` / `INVALID_LINK_NAME` (400),
`LINK_NOT_FOUND` (404), `VERSION_CONFLICT` / `DUPLICATE_LINK_NAME` (409),
`INTERNAL` (500, generic — no storage/framework internals leaked).

Full design: [`docs/architecture/rest-api.md`](docs/architecture/rest-api.md),
[`docs/architecture/sse.md`](docs/architecture/sse.md).

## 10. Common tasks

Where things go and the command to prove it — the [dependency rule](#7-project-structure)
tells you the layer.

| Task | Where | Then |
| ---- | ----- | ---- |
| Add/change a **domain model or rule** (e.g. a new `Link` field) | `libs/domain/src/lib/*` (types, `deriveLinkStatus`, validation constants) — the one source of truth; then thread the field through DTOs and the form | `npx nx test @linkops/domain` |
| Add/change a **backend endpoint** | `libs/api-feature/src/lib` (controller + DTO + service); map any new domain error in `api-exception.filter.ts` | `npx nx test @linkops/api-feature` |
| Change **persistence** | `libs/api-data-access` (`InMemoryLinkRepository`) behind the `LinkRepository` interface — call sites unaffected | `npx nx test @linkops/api-data-access` |
| Add a **UI panel / feature** | `libs/console-feature` (routed container) + `libs/console-ui` (presentational) + `libs/console-data-access` (store/REST) | `npx nx test @linkops/console-feature` |
| Add/update a **test** | co-located `*.spec.ts` next to the unit | `npx nx test <project>` |
| **Full validation** | — | `npm test && npm run typecheck && npm run lint && npm run build` |

After changing cross-project imports, run `npx nx sync` to update the TypeScript
project references.

## 11. Troubleshooting

| Symptom | Fix |
| ------- | --- |
| **Port 3000 in use** (`EADDRINUSE`) | Another API is running. Stop it, or start with a different port: `PORT=4000 npm run dev:api` (update the proxy target if you also run the client). |
| **Port 4200 in use** | Another dev server is running. Stop it, or run `npx nx serve @linkops/console --port 4300`. |
| **`Cannot find module '@linkops/…'` in tests** | You should not hit this — Jest resolves workspace libs to source. If you do, you are on a stale checkout; pull latest. No build is required before `npm test`. |
| **SSE not updating in the UI** | Confirm the API is up (`GET /api/stream` returns `text/event-stream`). Background browser tabs throttle `requestAnimationFrame`, so the coalesced repaint pauses while the tab is hidden — focus the tab. A proxy that **buffers** `text/event-stream` will also stall it (the dev proxy does not). |
| **API unavailable / blank fleet** | The client proxies `/api` to `:3000` ([`apps/console/proxy.conf.cjs`](apps/console/proxy.conf.cjs)). Ensure the API started (`[linkops-api] … listening on :3000`). |
| **Deep link (`/links/:id`) 404s on refresh** | The dev proxy bypass serves `index.html` for HTML navigations; if you changed the proxy, keep that bypass so the SPA router owns deep links. |
| **Stale build artifacts / odd type errors** | Remove generated output and re-run: delete `dist/`, `out-tsc/`, `.nx/cache`, `*.tsbuildinfo`, then `npm test`. Tests need no `dist/`. |

## 12. Decisions, gaps and next steps

### Three decisions I would defend (and the alternative rejected)

1. **Nx monorepo with enforced boundaries** — one library per layer per scope,
   tags + `@nx/enforce-module-boundaries` so a boundary violation **fails lint**.
   *Rejected:* two plain folders (`api/`, `client/`) — nothing would stop the
   domain importing Angular later; the boundary would be a convention, not a
   guarantee. [ADR 0001](docs/adr/0001-enforced-nx-library-boundaries.md).
2. **Angular zoneless + signal-first** — `provideZonelessChangeDetection()`, SSE
   events fold into signals and repaint once per animation frame. *Rejected:*
   default zone.js change detection — it re-checks the whole tree on every async
   event, the exact 1 Hz change-detection storm the brief calls out.
   [ADR 0002](docs/adr/0002-angular-zoneless-signal-first.md).
3. **SSE is live-only (no server-side replay)** — a reconnect opens a fresh
   subscription; gaps are refetched from `GET /api/links/:id/telemetry`.
   *Rejected:* a `Last-Event-ID` replay buffer — unbounded per-client server memory
   and replay-ordering complexity for a dashboard where the latest value is what
   matters. [ADR 0003](docs/adr/0003-sse-live-only-no-replay.md).

A fourth, smaller one: after a delete the client prunes the row locally
(`FleetStore.removeLink`) rather than refetching, because the live stream carries
no `link.deleted` event — so a link deleted by **another** client only disappears
on the next snapshot load. An accepted limitation of the live-only contract.

### Where this breaks at ~10,000 links

Today's fleet is ~10. The first thing to break at 10k is the **client fleet model
and render path**, not the backend:

- Every tick produces up to *N* `link.telemetry` frames plus one `fleet.summary`;
  at 10k that is ~10k messages/second over one `EventSource`, and `FleetStore`
  rebuilds a `Map` of 10k rows each coalesced frame. Even at one repaint per frame,
  diffing/rendering 10k rows is the bottleneck.
- **First fix:** stop streaming per-link telemetry to the fleet view. Push only
  `fleet.summary` + `link.status` **transitions** to the list, virtualize the table
  (render only visible rows), and subscribe to per-link telemetry **only** on the
  detail view for the open link. Move filtering/sorting server-side
  (`GET /api/links` already supports it) so the client never holds the full set.
- Secondary: the in-memory `Map` + per-link 300-sample ring buffers are ~O(N)
  memory; at 10k that is still fine in RAM but is the point to swap
  `InMemoryLinkRepository` for a durable implementation the `LinkRepository`
  interface already allows.

### Deliberately not built (and why)

- **B2 / B2a — A2UI panel + credentials.** Not implemented. It is the highest-value
  bonus, but doing it well (a component-registry renderer over an untrusted
  whitelist, a round-trip interaction, a deterministic stub agent, secret handling)
  needs more time than remained, and a half-working panel scores worse than a clean
  omission. Not faked: there is no empty `agent/ui` package and no A2UI claim in the
  code. The app requires no AI credentials.
- **B4 — Module Federation.** Skipped. Splitting a working area into a federated
  remote adds host/remote **version-skew** risk that only pays off on a real
  multi-team/multi-deploy boundary. If it shipped on a device I would pin a shared
  contract version and fail fast on a host/remote singleton mismatch rather than
  silently loading an incompatible remote.
- **B5 — Performance budgets.** Bundle budgets exist as build **warnings**; turning
  them into build-failing budgets with `@defer`/virtual-scrolling and per-tick cost
  numbers was traded for finishing the core and B6 cleanly.

### What another day would buy

1. **B2 A2UI** — the highest-value remaining bonus (server-described panel +
   round-trip + stub agent).
2. **Table virtualization** and the fleet-view streaming change above (the 10k
   path).
3. **Broader accessibility** passes on the detail/form views.

### AI usage, and one override

This codebase was built with AI assistance (Claude Code) under human direction,
milestone by milestone, through explicit review gates; all commits are authored by
the repository owner.

**One concrete override:** the AI's milestone reports initially declared a
milestone "ready" based on a **warm working tree** where `dist/` already existed. A
clean-checkout audit (`git clone` + `npm install` + `npm test`) was run instead and
**failed** — the tests were resolving workspace libraries through gitignored
`dist/`. The reported "green" was rejected, the cause traced to Jest not applying
the `@org/source` export condition, and the fix (source resolution in the console
Jest configs) validated from a fresh clone. Runtime claims were treated the same
way — the 409 conflict flow was verified with a real two-tab test against a running
backend, not assumed from unit tests.

### Requirement coverage

| # | Requirement | Status |
| - | ----------- | ------ |
| M1 | Domain + in-memory store behind `LinkRepository`; 10-link seed; derived status | ✅ |
| M2 | 1 Hz telemetry simulator; bounded 300-sample ring buffer | ✅ |
| M3 | REST CRUD + summary + telemetry; validated DTOs; one error envelope | ✅ |
| M4 | Single SSE endpoint; disconnect cleanup; reconnect; coalescing | ✅ |
| M5 | Angular fleet view; signals; sortable/filterable; URL-backed state | ✅ |
| M6 | Link detail (live SVG sparkline) + validated create/edit form | ✅ |
| M7 | version→409 resolution; confirmed deletes; readable failures | ✅ |
| M8 | Domain/repo unit tests + HTTP-contract test + SSE test + store/component tests | ✅ |
| B1 | Nx workspace with enforced module boundaries | ✅ |
| B3 | Zoneless + signal-first under a 1 Hz stream | ✅ |
| B6 | CI (lint/typecheck/test/build) + ADRs + conventional commits | ✅ |
| B2 / B2a | A2UI panel + credentials | ✖ deliberate omission |
| B4 | Module Federation | ✖ deliberate omission |
| B5 | Performance budgets | ✖ deliberate omission |
