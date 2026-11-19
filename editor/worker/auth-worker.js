// Cloudflare Worker: POST /token { code, redirect_uri } -> { access_token }.
// Secrets/vars (wrangler secret put / wrangler.toml):
//   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ALLOWED_ORIGINS (comma-separated)
import { exchangeCode } from '../server/exchange.js';

function cors(origin, allowed) {
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const headers = { 'Content-Type': 'application/json', ...cors(origin, allowed) };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/token') {
      return new Response('{"error":"not_found"}', { status: 404, headers });
    }
    if (!allowed.includes(origin)) return new Response('{"error":"origin_not_allowed"}', { status: 403, headers });
    try {
      const { code, redirect_uri } = await request.json();
      const token = await exchangeCode({
        code, redirectUri: redirect_uri, clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET
      });
      return new Response(JSON.stringify(token), { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400, headers });
    }
  }
};
