import { defineConfig, loadEnv, type Plugin } from 'vite';
import { exchangeCode } from './server/exchange.js';

// Dev-only stand-in for the token-exchange endpoint (worker/auth-worker.js in
// production). Reads GITHUB_CLIENT_SECRET from editor/.env.local, which never
// reaches the browser bundle (only VITE_* variables do).
function githubOAuthDev(env: Record<string, string>): Plugin {
  return {
    name: 'bssw-github-oauth-dev',
    configureServer(server) {
      server.middlewares.use('/api/auth/token', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method_not_allowed"}'); return; }
        let raw = '';
        for await (const chunk of req) raw += chunk;
        try {
          const { code, redirect_uri } = JSON.parse(raw || '{}');
          const token = await exchangeCode({
            code,
            redirectUri: redirect_uri,
            clientId: env.VITE_GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET
          });
          res.end(JSON.stringify(token));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // The editor reads _data/ and _includes/components/ from the Jekyll repo.
    server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
    plugins: [githubOAuthDev(env)]
  };
});
