# 0001 — Enforced Nx library boundaries

- Status: Accepted
- Date: 2026-08-14

## Context

The assignment is graded on architecture: clear layers, dependencies pointing one
way, domain logic independent of Nest and Angular. A convention ("please don't
import Angular into the domain") is not enforceable and drifts as the codebase
grows.

## Decision

Structure the solution as an Nx workspace with one library per layer per scope —
`domain` (shared), `data-access`, `feature`, `ui` for each of `scope:api` and
`scope:console` — plus thin app shells (`apps/api`, `apps/console`). Every library
carries `scope:*` and `type:*` tags, and `@nx/enforce-module-boundaries` in the
ESLint config turns a boundary violation into a **lint error**:

| Layer (`type:`) | May depend on |
| --------------- | ------------- |
| `domain` | *nothing* |
| `data-access` | `domain` |
| `feature` | `domain`, `data-access`, `ui` |
| `ui` | `domain` |
| `app` | any of the above |

Plus scope isolation: `scope:api` and `scope:console` may never depend on each
other; both may depend only on `scope:shared` (the domain).

## Alternatives considered

- **Two plain folders (`api/`, `client/`).** Faster to start, but nothing stops
  the domain importing Angular or Nest later; the boundary would be a convention,
  not a guarantee, and would erode under time pressure.

## Consequences

- A dependency violation fails `npm run lint` (and CI), so the architecture is
  self-policing.
- Swapping the in-memory repository for a durable one touches one library behind
  the `LinkRepository` interface; call sites are unaffected.
- Cost: more up-front files/boilerplate and a small learning curve for the Nx
  tags — accepted as the price of an enforced, not aspirational, boundary.
