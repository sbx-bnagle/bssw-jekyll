// Exchanges a GitHub OAuth `code` for an access token. Needs the client
// secret, so it runs server-side: in the Vite dev server (vite.config.ts) or
// in the Cloudflare Worker (worker/auth-worker.js).
export async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  if (!code) throw new Error('missing_code');
  if (!clientId || !clientSecret) throw new Error('oauth_not_configured');
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error_description || data.error || `github_${res.status}`);
  return { access_token: data.access_token, scope: data.scope, token_type: data.token_type };
}
