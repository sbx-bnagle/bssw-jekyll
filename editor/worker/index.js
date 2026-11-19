// Production entry: one Cloudflare Worker serves the built editor (static
// assets from dist/) and the OAuth token exchange at /api/auth/token, so the
// editor and its auth endpoint share an origin and need no CORS.
//
// Config (wrangler.jsonc vars / secrets):
//   GITHUB_CLIENT_ID      public, also baked into the build as VITE_GITHUB_CLIENT_ID
//   GITHUB_CLIENT_SECRET  secret: `npx wrangler secret put GITHUB_CLIENT_SECRET`
import { exchangeCode } from '../server/exchange.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/auth/token') return env.ASSETS.fetch(request);

    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    // Only the editor itself may exchange codes.
    if (request.headers.get('Origin') !== url.origin) return json(403, { error: 'origin_not_allowed' });
    try {
      const { code, redirect_uri } = await request.json();
      if (redirect_uri && new URL(redirect_uri).origin !== url.origin) return json(400, { error: 'bad_redirect_uri' });
      const token = await exchangeCode({
        code,
        redirectUri: redirect_uri,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET
      });
      return json(200, token);
    } catch (err) {
      return json(400, { error: err.message });
    }
  }
};
