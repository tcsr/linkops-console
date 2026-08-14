/**
 * Dev-server proxy. The API is served under a single `/api` namespace
 * (`/api/links`, `/api/fleet/summary`, `/api/stream`), so it no longer overlaps
 * the SPA's client-side routes (`/links/:id`, `/links/new`, …) — those are
 * served natively by the dev server's index fallback.
 *
 * The `bypass` hook is retained defensively: a browser navigation (Accept:
 * text/html) is served `index.html` so the Angular router owns it, while XHR
 * JSON and the SSE stream (`text/event-stream`) fall through to the real API.
 * This is dev-tooling only — it changes no backend route or contract.
 */
const target = 'http://localhost:3000';

/** Serve index.html for HTML navigations; proxy everything else. */
function bypass(req) {
  const accept = req.headers.accept ?? '';
  if (req.method === 'GET' && accept.includes('text/html')) {
    return '/index.html';
  }
  return undefined;
}

module.exports = {
  '/api': { target, secure: false, changeOrigin: true, bypass },
};
