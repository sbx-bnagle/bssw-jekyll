// GitHub OAuth (web flow). The code-for-token exchange needs the client
// secret, so it goes through config.authUrl (dev middleware or worker).
import { config } from './config';

const TOKEN = 'bssw-editor:token';
const STATE = 'bssw-editor:oauth-state';

export const getToken = () => localStorage.getItem(TOKEN);
export const signOut = () => localStorage.removeItem(TOKEN);
export const oauthConfigured = () => Boolean(config.clientId);

const redirectUri = () => `${location.origin}${location.pathname}`;

export function signIn() {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem(STATE, state);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    // public_repo: create draft branches/files and pull requests in public repos.
    scope: 'public_repo',
    state,
    allow_signup: 'true'
  });
  location.assign(`https://github.com/login/oauth/authorize?${params}`);
}

/** Completes the OAuth redirect if the URL carries ?code=...; returns an error message on failure. */
export async function completeSignIn(): Promise<string | null> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (!code && !oauthError) return null;
  url.searchParams.delete('code'); url.searchParams.delete('state');
  url.searchParams.delete('error'); url.searchParams.delete('error_description'); url.searchParams.delete('error_uri');
  history.replaceState(null, '', url.toString());
  if (oauthError) return oauthError;
  if (!state || state !== sessionStorage.getItem(STATE)) return 'Sign-in failed: state mismatch. Try again.';
  sessionStorage.removeItem(STATE);
  try {
    const res = await fetch(config.authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri() })
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return `Sign-in failed: ${data.error || res.statusText}`;
    localStorage.setItem(TOKEN, data.access_token);
    return null;
  } catch (e) {
    return `Sign-in failed: ${(e as Error).message}`;
  }
}
