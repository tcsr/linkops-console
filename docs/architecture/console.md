# Angular Console — Fleet View (M5) + Link Detail/Edit (M6)

> Scope: the Angular client. **M5** is the fleet view; **M6** adds the link
> detail view with live telemetry and the validated create/edit form. Both
> consume the existing M3 REST and M4 SSE contracts and change no backend code.
> Concurrency/error UX — 409 conflict resolution, delete confirmation, and rich
> failure messaging — is **M7** and is deliberately *not* built here.

## Requirement vs decision vs detail

- **Assignment requirement** — mandated by the PDF (§2 M5, scoring §5).
- **Approved architecture decision** — a choice the PDF leaves open, reviewed
  and approved.
- **Implementation detail** — a local choice with no architectural weight.

## What M5 delivers (PDF §2 M5)

A sortable, filterable list of links with **live status** and **current
throughput**, plus the **KPI header** — with **filter/sort state in the URL** so
a view is shareable and survives reload. Standalone components, signal-based
state.

## Stack

- **Angular 22** (requirement), **standalone** components (requirement),
  **signal-first** state (requirement).
- **Zoneless** — `provideZonelessChangeDetection()`, no zone.js in the app
  bundle *(approved decision / bonus B3; not mandatory)*. Change detection is
  driven purely by signals, which directly serves the "no change-detection storm
  at 1 Hz" scoring line.
- **No NgRx** — plain Angular signals *(decision; the PDF does not require a
  state library)*.

## Library layout & dependency rule

```
apps/console (type:app)
  → console-feature (type:feature)  smart/routed views
      → console-data-access (type:data-access)  signals + REST + SSE
      → console-ui (type:ui)                     presentational components
      → domain (type:domain, scope:shared)       shared types (source of truth)
```

Enforced by `@nx/enforce-module-boundaries` (a lint error on violation).
`type:ui` depends on `type:domain` only, so the UI uses a domain-typed
view-model (`FleetRow`), never the data-access model. No `console → api`, no
`api ↔ console`. The domain stays framework-free.

## Data flow

```
GET /links, /fleet/summary ──► FleetApi ──►┐
                                           ├─► FleetStore (signals) ─► FleetView ─► console-ui
GET /api/stream (EventSource) ─► buffer ──►┘        │                    (filter/sort)
   link.telemetry / link.status / fleet.summary     │
                                                     ▼
                                            rows(), summary(), status(),
                                            connection(), error(), isEmpty()
```

- **Initial snapshot** via REST (`FleetApi` → `GET /links` + `/fleet/summary`).
- **Live deltas** via the browser `EventSource` on `GET /api/stream`. No polling,
  no second scheduler. The server remains the authority on derived status — no
  business logic is duplicated in the client.

## Render coalescing (the M4-deferred item)

*(Approved decision — the mechanism the PDF's "no re-render per message per link"
concern calls for.)* Incoming SSE events are pushed to a buffer and applied to
the signal state **once per animation frame** (`requestAnimationFrame`, injected
as `FRAME_SCHEDULER` for deterministic tests). A burst of telemetry therefore
produces **one** signal update, not one per message per link. Combined with:

- **zoneless + signals** — only dependents of a changed signal recompute;
- **`@for (... ; track row.id)`** — a live update mutates only the changed row,
  never recreating the collection;
- **`applyEvents` returning the same model reference when nothing changed** — a
  no-op flush triggers no render.

`FRAME_SCHEDULER` and `EVENT_SOURCE_FACTORY` are injection tokens so tests flush
frames and drive SSE frames deterministically, with no timers.

## URL-backed filter/sort (PDF §2 M5)

The five filter/sort params (`status`, `band`, `q`, `sort`, `order`) live in the
URL query string and are bound to `FleetView` inputs via router
**component-input binding**, so a view is shareable and survives reload. Changing
a control navigates (`queryParamsHandling: 'merge'`, defaults cleared) so state
round-trips through the URL. Filtering/sorting is derived **client-side over the
live signal state** (`selectRows`, a pure function), so live updates keep
re-filtering/re-sorting without a server round-trip *(decision D6)*. The REST
`GET /links` filter/sort capability stays available but is not called per
interaction.

## States

`FleetView` renders one of: **loading** (before the snapshot), **error** (REST
failure, with the message), **empty** (loaded, zero links), or the **table**.
The SSE connection state (`connecting`/`open`/`reconnecting`) is shown in the
header.

## Reconnect

Live-only, native `EventSource` (the M4 contract). On a drop the store reflects
`reconnecting`; the browser reconnects and re-fires `open`. There is no replay —
historical gaps are recovered via the REST telemetry history endpoint. The
`EventSource` and any pending frame are released on component/store destroy
(`DestroyRef`), so there are no leaked subscriptions.

## Deletion note *(known limitation, tied to the M4 contract)*

The M4 stream carries no per-link create/delete event. A link deleted server-side
simply stops receiving telemetry; the console reflects the removal on the next
full snapshot load. Delete UX itself is M7 scope, so this does not affect M5/M6.

## M6 — Link detail + edit

*(PDF §2 M6: "Detail view with live telemetry (a sparkline … hand-rolled SVG is
fine, no chart library needed) and a validated form to create and edit a link.
Client-side validation mirrors the server rules, and the server still enforces
them.")*

### Routing *(approved decision — the PDF mandates the views, not the URLs)*

```
/                 FleetView        (M5)
/links/new        LinkFormView     create
/links/:id        LinkDetailView   detail
/links/:id/edit   LinkFormView     edit
```

`links/new` precedes the parameterized routes so it is not captured as an `:id`;
a `**` wildcard redirects unknown paths to the fleet. Route params bind to
component inputs (`withComponentInputBinding`), so **deep links and browser
refresh** load the same view. The fleet list navigates to detail by emitting a
router-agnostic `rowSelect` from the presentational table; the container decides
the destination.

**Dev-server proxy bypass** *(implementation detail)* — the API is mounted at
bare paths (`/links`, `/fleet`, `/api`) that collide with the client routes. The
proxy (`proxy.conf.cjs`) serves `index.html` for HTML navigations (so the router
owns deep links/refresh) while XHR JSON and the SSE stream still proxy to the
API. No backend route or contract changes.

### Detail data flow *(reuses the single SSE stream — no second EventSource)*

```
/links/:id ─► FleetApi.linkById ──►┐
/links/:id/telemetry ─► FleetApi ──┤─► LinkDetailStore (signals) ─► LinkDetailView
                                    │        │                         (attrs, badge,
FleetStore.rows() (live SSE) ──────►┘        ▼                          sparkline)
   (already coalesced per frame)     link(), status(), latestSample(),
                                     series(), state(), connection()
```

- The detail **snapshot** and **telemetry history** load via REST, so the view is
  self-sufficient on a deep link.
- **Live** telemetry/status fold in by reading the already-coalesced
  `FleetStore.rows()` for this link — the fleet store stays the *single* owner of
  the `EventSource` and the rAF coalescing. A signal `effect` appends new samples
  to a **bounded** series (`SPARKLINE_MAX_POINTS = 60`, ~1 min at 1 Hz), so there
  is no second scheduler, no polling, and no unbounded growth.

### Telemetry visualization *(decision — hand-rolled SVG, per the PDF)*

`Sparkline` (`console-ui`, presentational, dependency-free) draws a normalized
filled trend line with a head marker from a numeric series + an upper bound
(capacity). It re-renders at most once per coalesced tick (OnPush + one signal
update per frame), so a 1 Hz stream costs one redraw per second. No chart library
was added.

### Create/edit form *(PDF requirement; client validation mirrors server)*

`LinkFormView` (`console-feature`) is a **strongly typed reactive form** whose
validators mirror the shared domain constants (`BANDS`, `MODES`,
`CHANNEL_WIDTHS`, `CAPACITY_MBPS`, `TX_POWER_DBM`, name/site lengths) — the exact
rules the server DTOs enforce. It distinguishes **prefill loading** from **submit
in progress**, blocks an invalid submit, guards against **duplicate submission**
while a save is in flight, and on success navigates to the link's detail. Editing
sends the loaded `version` as `expectedVersion` (optimistic concurrency).

**M6/M7 seam** — a rejected save surfaces a readable message via a typed
error-envelope parser (`parseApiError`). The richer **409 conflict-resolution
UX** (show current vs. mine, let the user reconcile), **delete confirmation**, and
delete/validation error polish are **M7** and are intentionally not built. The
parser is the minimum shared foundation M7 will consume.

### States

- **Detail** — `loading`, `not-found` (404), `error` (other REST failure), or the
  loaded view; a "waiting for the first sample" note before telemetry arrives.
- **Form** — prefill `loading`/`load-error` (edit), per-field validation errors,
  `saving`, save success (navigate), and save failure (message).

## Testing

- **Pure logic** (fast, no Angular): `fleet-model` reducers, `parseFleetEvent`,
  `fleet-filter` (`parseFilter`, `selectRows`), `parseApiError` (error envelope).
- **Store** (`console-data-access`, TestBed + fake EventSource + manual
  scheduler + `HttpTestingController`): snapshot load, empty, REST error, burst
  coalescing (one flush), status/summary events, reconnect state, destroy
  cleanup, idempotent connect; **LinkDetailStore** — load, 404→not-found, error,
  live-fold from the shared stream, history bounding; **FleetApi** detail +
  mutation methods.
- **Components** (`console-ui`): StatusBadge, KpiHeader, **Sparkline**,
  **FleetTable** rowSelect.
- **Feature** (`console-feature`, TestBed): FleetView loading/rows+KPI/URL-bound
  filtering/empty/error; **LinkDetailView** render + not-found; **LinkFormView**
  create/validation-block/valid-create/edit-prefill+version/save-failure/
  duplicate-submit.

Tests run zoneless via `jest-preset-angular` (`setupZonelessTestEnv`).

## Tooling notes *(implementation detail)*

- The console libraries are Angular-flavored libs: their source is compiled by
  the app's `@angular/build` (via the `@org/source` condition), so they have no
  separate emit build.
- Self-contained Angular tsconfigs (`module: preserve`, `moduleResolution:
  bundler`) isolate Angular from the backend's `nodenext`/composite tsc plumbing;
  the TypeScript project-reference sync generator is disabled for that reason.
- The dev server resolves the workspace libs via tsconfig `paths` (so vite does
  not prebundle them); `FleetView` is eagerly routed.
