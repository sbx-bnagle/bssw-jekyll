// Minimal GitHub REST client for the editor's draft workflow.
export class GitHubError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface GitHubUser { login: string; name: string | null; avatar_url: string }
export interface RepoInfo { full_name: string; name: string; default_branch: string; permissions?: { push?: boolean } ; owner: { login: string } }

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export class GitHub {
  constructor(private token: string) {}

  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GitHubError(res.status, data.message || res.statusText);
    return data as T;
  }

  user() { return this.request<GitHubUser>('GET', '/user'); }
  repo(full: string) { return this.request<RepoInfo>('GET', `/repos/${full}`); }
  fork(full: string) { return this.request<RepoInfo>('POST', `/repos/${full}/forks`, { default_branch_only: true }); }
  syncFork(full: string, branch: string) { return this.request('POST', `/repos/${full}/merge-upstream`, { branch }); }

  async refSha(full: string, branch: string): Promise<string | null> {
    try { return (await this.request<{ object: { sha: string } }>('GET', `/repos/${full}/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`)).object.sha; }
    catch (e) { if (e instanceof GitHubError && e.status === 404) return null; throw e; }
  }
  createBranch(full: string, branch: string, sha: string) {
    return this.request('POST', `/repos/${full}/git/refs`, { ref: `refs/heads/${branch}`, sha });
  }
  async branchesWithPrefix(full: string, prefix: string): Promise<string[]> {
    const refs = await this.request<{ ref: string }[]>('GET', `/repos/${full}/git/matching-refs/heads/${prefix}`);
    return refs.map((r) => r.ref.replace(/^refs\/heads\//, ''));
  }

  async file(full: string, path: string, ref: string): Promise<{ text: string; sha: string } | null> {
    try {
      const d = await this.request<{ content: string; sha: string }>('GET', `/repos/${full}/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return { text: fromBase64(d.content), sha: d.sha };
    } catch (e) { if (e instanceof GitHubError && e.status === 404) return null; throw e; }
  }
  async fileSha(full: string, path: string, ref: string): Promise<string | undefined> {
    try { return (await this.request<{ sha: string }>('GET', `/repos/${full}/contents/${path}?ref=${encodeURIComponent(ref)}`)).sha; }
    catch (e) { if (e instanceof GitHubError && e.status === 404) return undefined; throw e; }
  }
  putFile(full: string, path: string, base64: string, branch: string, message: string, sha?: string) {
    return this.request<{ content: { sha: string } }>('PUT', `/repos/${full}/contents/${path}`, { message, content: base64, branch, ...(sha ? { sha } : {}) });
  }
  deleteFile(full: string, path: string, branch: string, message: string, sha: string) {
    return this.request('DELETE', `/repos/${full}/contents/${path}`, { message, branch, sha });
  }

  openPulls(full: string, head: string) {
    return this.request<{ html_url: string }[]>('GET', `/repos/${full}/pulls?state=open&head=${encodeURIComponent(head)}`);
  }
  createPull(full: string, body: { title: string; head: string; base: string; body: string }) {
    return this.request<{ html_url: string }>('POST', `/repos/${full}/pulls`, body);
  }
}
