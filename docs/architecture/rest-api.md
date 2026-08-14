# REST API (M3)

> Scope: the M3 NestJS REST layer. SSE/EventBus (M4) and the UI (M5+) are not
> implemented; telemetry is exposed via request/response only.

## Layering

```text
HTTP request
  ↓
NestJS Controller        (libs/api-feature) — parses/validates the HTTP boundary
  ↓
Application service       (libs/api-feature) — LinksService / FleetService
  ↓
LinkRepository (token)    (libs/domain)      — abstraction
  ↓
InMemoryLinkRepository    (libs/api-data-access) — Map + bounded RingBuffer
  ↓
Domain                    (libs/domain)      — types, deriveLinkStatus
```

Controllers never touch the `Map`/`RingBuffer` internals — they depend only on
`LinksService`/`FleetService`, which depend only on the `LinkRepository`
abstraction (injected via the `LINK_REPOSITORY` token) and the domain. Dependency
direction is unchanged from M0: `api-feature → domain + api-data-access`.

## Endpoints

| Method & path | Success | Notes |
| ------------- | ------- | ----- |
| `GET /api/links` | 200 | Filters: `band`, `mode`, `search` (repository/domain-level), `status` (derived, filtered in feature layer). Sort: `sort` ∈ {name, capacityMbps, status, createdAt, updatedAt}, `order` ∈ {asc, desc}. |
| `GET /api/links/:id` | 200 | Link view (link + derived `status` + `latestSample`). |
| `POST /api/links` | 201 | Body = `CreateLinkDto`. |
| `PATCH /api/links/:id` | 200 | Body = `UpdateLinkDto` (partial + required `expectedVersion`). |
| `DELETE /api/links/:id` | 204 | — |
| `GET /api/links/:id/telemetry?windowMs=` | 200 | Samples from the ring buffer via `repository.getSamples`; default window 5 min (300 000 ms). |
| `GET /api/fleet/summary` | 200 | Domain `FleetSummary`. |

`GET /api/links` and `GET /api/links/:id` return a **LinkView**: the domain `Link` plus a
`status` derived on demand via `deriveLinkStatus(link, latestSample, now)` and the
`latestSample` (or `null`). Status is never stored.

## Validation

DTOs (`class-validator` + `class-transformer`) live in `api-feature`; the domain
models carry no framework decorators. A global `ValidationPipe`
(`whitelist`, `forbidNonWhitelisted`, `transform`) runs at the boundary. Covered:
required fields, string length (name 3–40), enum membership (band/mode/channel
width/status/sort/order), numeric ranges (`capacityMbps ≥ 1`, `txPowerDbm` −10..30),
and query-parameter shape (unknown params rejected).

## Error envelope & status codes

M0 does not define an envelope, so this shape is an explicit implementation
decision:

```json
{ "error": { "code", "message", "statusCode", "timestamp", "path", "details"? } }
```

A single global `ApiExceptionFilter` maps every error consistently:

| Error | HTTP | `code` |
| ----- | ---- | ------ |
| validation failure (pipe) | 400 | `VALIDATION_FAILED` (field messages in `details`) |
| `InvalidLinkIdError` | 400 | `INVALID_LINK_ID` |
| `InvalidLinkNameError` | 400 | `INVALID_LINK_NAME` |
| `LinkNotFoundError` | 404 | `LINK_NOT_FOUND` |
| `VersionConflictError` | 409 | `VERSION_CONFLICT` (`expected`/`actual` in `details`) |
| `DuplicateLinkNameError` | 409 | `DUPLICATE_LINK_NAME` |
| anything else | 500 | `INTERNAL` (generic message; no storage/framework internals leaked) |

409 is used only for genuine state conflicts (stale version, duplicate unique
name) — never for ordinary validation errors.

## Optimistic concurrency

`PATCH /api/links/:id` requires `expectedVersion` in the body. The service forwards it
to `repository.update(id, patch, expectedVersion)`; a mismatch throws
`VersionConflictError` → 409 `VERSION_CONFLICT` (with `expectedVersion` /
`actualVersion` in `details`) and the stored entity is left untouched.

`DELETE /api/links/:id` takes **no** version parameter: it returns **204** on success
and **404** `LINK_NOT_FOUND` for an unknown id. It therefore never produces the
optimistic-concurrency 409 — a delete is unconditional, so there is no stale-version
class to detect. Optimistic concurrency applies to `PATCH` only. (The M7 console
consumes this contract as-is; it does not add DELETE-conflict handling.)

## Telemetry simulator lifecycle (NestJS)

`TelemetrySimulatorService` is a real NestJS provider (constructed via factory,
injected with the repository). NestJS owns it:

- **startup:** `onModuleInit` → `start()` (single global 1 Hz interval).
- **shutdown:** `enableShutdownHooks()` in bootstrap routes SIGTERM/SIGINT through
  the Nest lifecycle → `onApplicationShutdown` → `stop()` (timer cleared). No
  abrupt `process.exit`.

Hardening (M3):

- **No overlapping ticks:** the interval calls `runTick()`, which skips if a tick
  is still in flight — at most one tick runs at a time (important once the repo
  can be asynchronous/durable).
- **Contained tick errors:** `runTick()` catches failures and routes them to an
  `onError` handler; a failing tick never becomes an unhandled rejection and never
  blocks later ticks.

## Testing

`api.integration.spec.ts` boots the real `ApiModule` via `@nestjs/testing` and
drives it with `supertest` over the actual HTTP server — proving
HTTP → controller → service → repository wiring end to end (CRUD, filtering,
sorting, telemetry, fleet summary, validation 400, 404, 409, error envelope), plus
a NestJS lifecycle test (provider started on init, stopped on close).

## Evolution to M4

The same telemetry the simulator writes to the ring buffers will be pushed to
clients by the future **M4 SSE stream layer**. No SSE/EventBus/WebSocket
infrastructure is introduced in M3.
