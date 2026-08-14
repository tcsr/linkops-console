# 0002 — Angular zoneless + signal-first change detection

- Status: Accepted
- Date: 2026-08-14

## Context

The console consumes a 1 Hz telemetry stream for the whole fleet. Under Angular's
default zone.js change detection, every async event (each SSE message, each timer)
re-checks the entire component tree — a change-detection storm at 1 Hz across N
links, which is exactly the failure mode the brief calls out.

## Decision

Run the client zoneless (`provideZonelessChangeDetection()`, no zone.js) and make
state signal-first. SSE events fold into signals; the fleet store buffers incoming
frames and applies them **once per animation frame** (`requestAnimationFrame`,
injected as `FRAME_SCHEDULER` for deterministic tests). Combined with
`@for (… ; track id)` and stores that return the same model reference when nothing
changed, a burst of telemetry produces one repaint, and only the rows that changed
re-render.

## Alternatives considered

- **Default zone.js change detection.** "Just works" with no configuration, but
  re-checks the whole tree on every async event — the 1 Hz storm above. Manual
  `markForCheck`/`detach` tuning would claw performance back at the cost of the
  simplicity that was its only advantage.

## Consequences

- No `NgZone`, no manual `tick()`; change detection is driven by signal reads.
- Third-party code that relies on zone patching is not supported — accepted, since
  the app owns its async surface (EventSource + HttpClient).
- Tests flush frames deterministically via the injected scheduler (no real timers).
