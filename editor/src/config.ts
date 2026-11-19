const env = import.meta.env;

export const config = {
  clientId: (env.VITE_GITHUB_CLIENT_ID as string | undefined) ?? '',
  authUrl: (env.VITE_AUTH_URL as string | undefined) || '/api/auth/token',
  repo: (env.VITE_CONTENT_REPO as string | undefined) || 'sbx-bnagle/bssw-jekyll',
  branch: (env.VITE_CONTENT_BRANCH as string | undefined) || 'main',
  siteUrl: ((env.VITE_SITE_URL as string | undefined) || 'https://sbx-bnagle.github.io/bssw-jekyll').replace(/\/$/, '')
};
