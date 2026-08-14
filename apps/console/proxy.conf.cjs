/**
 * Dev-server proxy. The API is mounted at bare paths (`/links`, `/fleet`,
 * `/api`), which collide with the SPA's client-side routes (e.g. `/links/:id`).
 * Without a bypass, a full-page load of a detail route would be proxied to the
 * API and return JSON instead of the app.
 *
 * The `bypass` hook distinguishes a browser navigation (Accept: text/html) from
 * an API call: navigations are served `index.html` so the Angular router owns
 * them (deep links and refresh work), while XHR JSON and the SSE stream
 * (`text/event-stream`) fall through to the real API. This is dev-tooling only —
 * it changes no backend route or contract.
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

const common = { target, secure: false, changeOrigin: true, bypass };

module.exports = {
  '/links': { ...common },
  '/fleet': { ...common },
  '/api': { ...common },
};
