# 0004 — Serve the whole API under a single global `/api` prefix

- Status: Accepted
- Date: 2026-08-14

## Context

The assignment's suggested API contract prefixes every route with `/api`
(`/api/links`, `/api/fleet/summary`, `/api/stream`). An earlier iteration served
the REST routes at the root (`/links`, `/fleet/summary`) and only the SSE endpoint
at `/api/stream`, creating a `/links` vs `/api/stream` asymmetry. The Angular
client's own router also uses `/links/*` paths, so root-level API routes shared a
namespace with client routes and required a proxy bypass to disambiguate.

## Decision

Serve the entire API under one `/api` namespace via a single
`app.setGlobalPrefix('api')` in `apps/api/src/main.ts`. Controllers declare bare
routes (`links`, `fleet/summary`, `stream`); the prefix produces the effective
paths. The SSE endpoint is therefore `@Sse('stream')` — declaring `api/stream`
under the global prefix would double-prefix to `/api/api/stream`.

## Alternatives considered

- **Per-controller prefixes** (`@Controller('api/links')`, …). Works, but repeats
  `api/` on every controller and is easy to let drift; the global prefix is one
  line and uniform.
- **Keep the root/`/api-stream` asymmetry.** Valid (the PDF calls the contract "a
  starting point, not a spec to satisfy"), but a reviewer reasonably questions the
  inconsistency, and it leaves API and client-router paths sharing the `/links`
  namespace.

## Consequences

- REST and SSE are uniform (`/api/links`, `/api/fleet/summary`, `/api/stream`) and
  match the suggested contract.
- The API no longer overlaps the client router's `/links/*` paths; the dev proxy
  collapses to a single `/api` rule.
- No request/response contract, status code, or domain semantics changed — only
  the path prefix. Integration/component tests set the same global prefix so they
  exercise the real routes.
