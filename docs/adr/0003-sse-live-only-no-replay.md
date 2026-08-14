# 0003 — SSE is live-only (no server-side replay buffer)

- Status: Accepted
- Date: 2026-08-14

## Context

The stream must survive reconnects. SSE offers `Last-Event-ID`, which a server can
use to replay missed events after a drop. The product is an operator dashboard
where the latest value is what matters, and telemetry history is already available
over REST from the ring buffer.

## Decision

The SSE stream is live-only. `FleetEventBus` is a hot RxJS `Subject` that holds no
backlog: a late subscriber sees only future events. On a drop the native
`EventSource` reconnects and opens a fresh subscription; historical gaps are
recovered on demand via `GET /api/links/:id/telemetry`. The `id:` field on
telemetry frames is informational, not a replay key.

## Alternatives considered

- **`Last-Event-ID` replay buffer.** Survives gaps transparently, but adds
  unbounded per-client server memory and replay-ordering complexity to guarantee
  delivery of values that are superseded within a second on a live dashboard.

## Consequences

- Per-connection server memory is bounded by the socket buffer; nothing is queued,
  so telemetry is inherently latest-wins.
- A brief reconnect can miss a few samples in the live view; they are still fetched
  by the detail view's REST history call, so the chart is not permanently gapped.
- Multi-client caveat: a link deleted by another client only disappears on the
  next snapshot load, since the live stream carries no `link.deleted` event — an
  accepted limitation of the live-only contract.
