// Draft workflow on GitHub:
//   save    -> branch drafts/<login>/<slug>, file _drafts/<slug>.md (+ images, new authors)
//   submit  -> move to _posts/<date>-<slug>.md on the same branch, open a pull request
// Contributors without push access work in a fork; the PR goes upstream.
import yaml from 'js-yaml';
import { config } from './config';
import { GitHub, GitHubError, toBase64, type GitHubUser } from './github';
import { serialize, parse, type Draft } from './model';
import type { Author } from './data';

export interface Session { gh: GitHub; user: GitHubUser; target: string; viaFork: boolean }

export async function openSession(token: string): Promise<Session> {
  const gh = new GitHub(token);
  const user = await gh.user();
  const upstream = await gh.repo(config.repo);
  if (upstream.permissions?.push) return { gh, user, target: upstream.full_name, viaFork: false };
  // No push access: use (or create) the contributor's fork.
  let fork = await gh.repo(`${user.login}/${upstream.name}`).catch(() => null);
  if (!fork) {
    fork = await gh.fork(upstream.full_name);
    for (let i = 0; i < 10 && !(await gh.refSha(fork.full_name, config.branch).catch(() => null)); i++) {
      await new Promise((r) => setTimeout(r, 1500)); // forks are created asynchronously
    }
  }
  await gh.syncFork(fork.full_name, config.branch).catch(() => undefined);
  return { gh, user, target: fork.full_name, viaFork: true };
}

/** Fresh contributor list from the default branch. */
export async function fetchAuthors(s: Session): Promise<Record<string, Author> | null> {
  const f = await s.gh.file(config.repo, '_data/authors.yml', config.branch);
  return f ? ((yaml.load(f.text) || {}) as Record<string, Author>) : null;
}

const branchFor = (s: Session, slug: string) => `drafts/${s.user.login}/${slug}`;

async function ensureBranch(s: Session, branch: string) {
  if (await s.gh.refSha(s.target, branch)) return;
  const base = await s.gh.refSha(s.target, config.branch);
  if (!base) throw new Error(`Branch ${config.branch} not found in ${s.target}`);
  await s.gh.createBranch(s.target, branch, base);
}

function dataUrlToBase64(dataUrl: string) { return dataUrl.slice(dataUrl.indexOf(',') + 1); }

export async function saveDraft(s: Session, draft: Draft): Promise<Draft> {
  const slug = draft.meta.slug;
  if (!slug) throw new Error('Add a title first: the slug names the draft branch.');
  const branch = draft.remote?.branch ?? branchFor(s, slug);
  await ensureBranch(s, branch);

  // Images uploaded in the editor
  for (const [path, dataUrl] of Object.entries(draft.uploads)) {
    if (draft.committed.includes(path)) continue;
    const repoPath = path.replace(/^\//, '');
    const sha = await s.gh.fileSha(s.target, repoPath, branch);
    await s.gh.putFile(s.target, repoPath, dataUrlToBase64(dataUrl), branch, `Add image ${repoPath}`, sha);
    draft.committed.push(path);
  }

  // Contributors created in the editor
  const pending = Object.entries(draft.newAuthors);
  if (pending.length) {
    const f = await s.gh.file(s.target, '_data/authors.yml', branch);
    const current = f ? ((yaml.load(f.text) || {}) as Record<string, unknown>) : {};
    const additions = pending.filter(([slug]) => !(slug in current))
      .map(([slug, a]) => `${slug}:\n  name: ${JSON.stringify(a.name)}\n${a.github ? `  github: ${a.github}\n` : ''}  sort_name: ${JSON.stringify(a.name.split(' ').pop())}\n`);
    if (additions.length && f) {
      await s.gh.putFile(s.target, '_data/authors.yml', toBase64(`${f.text.replace(/\n*$/, '\n')}${additions.join('')}`), branch, `Add contributor ${pending.map(([k]) => k).join(', ')}`, f.sha);
    }
    draft.newAuthors = {};
  }

  const path = draft.remote?.path ?? `_drafts/${slug}.md`;
  const sha = await s.gh.fileSha(s.target, path, branch);
  const res = await s.gh.putFile(s.target, path, toBase64(serialize(draft.meta, draft.body)), branch, `${sha ? 'Update' : 'Start'} draft: ${draft.meta.title}`, sha);
  draft.remote = { ...draft.remote, repo: s.target, branch, path, sha: res.content.sha };
  return draft;
}

export interface RemoteDraft { branch: string; slug: string }

export async function listRemote(s: Session): Promise<RemoteDraft[]> {
  try {
    const branches = await s.gh.branchesWithPrefix(s.target, `drafts/${s.user.login}/`);
    return branches.map((b) => ({ branch: b, slug: b.split('/').pop() || b }));
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return [];
    throw e;
  }
}

export async function loadRemote(s: Session, r: RemoteDraft): Promise<Pick<Draft, 'meta' | 'body' | 'remote'> | null> {
  const candidates = [`_drafts/${r.slug}.md`];
  // A submitted draft lives in _posts/<date>-<slug>.md
  const posts = await s.gh.request<{ name: string; path: string }[]>('GET', `/repos/${s.target}/contents/_posts?ref=${encodeURIComponent(r.branch)}`).catch(() => []);
  const posted = posts.find((p) => p.name.endsWith(`-${r.slug}.md`));
  if (posted) candidates.unshift(posted.path);
  for (const path of candidates) {
    const f = await s.gh.file(s.target, path, r.branch);
    if (f) {
      const { meta, body } = parse(f.text);
      return { meta, body, remote: { repo: s.target, branch: r.branch, path, sha: f.sha } };
    }
  }
  return null;
}

/** Moves the draft into _posts/ on its branch and opens (or finds) the pull request. */
export async function submitForReview(s: Session, draft: Draft): Promise<string> {
  if (!draft.remote) throw new Error('Save the draft first.');
  const date = draft.meta.date || new Date().toISOString().slice(0, 10);
  draft.meta.date = date;
  const postPath = `_posts/${date}-${draft.meta.slug}.md`;
  const { branch } = draft.remote;
  if (draft.remote.path !== postPath) {
    const existing = await s.gh.fileSha(s.target, postPath, branch);
    const res = await s.gh.putFile(s.target, postPath, toBase64(serialize(draft.meta, draft.body)), branch, `Submit for review: ${draft.meta.title}`, existing);
    const oldSha = await s.gh.fileSha(s.target, draft.remote.path, branch);
    if (oldSha) await s.gh.deleteFile(s.target, draft.remote.path, branch, `Move ${draft.remote.path} to ${postPath}`, oldSha);
    draft.remote = { ...draft.remote, path: postPath, sha: res.content.sha };
  } else {
    await saveDraft(s, draft);
  }
  const owner = s.target.split('/')[0];
  const open = await s.gh.openPulls(config.repo, `${owner}:${branch}`);
  if (open.length) return open[0].html_url;
  const pr = await s.gh.createPull(config.repo, {
    title: `Blog post: ${draft.meta.title}`,
    head: `${owner}:${branch}`,
    base: config.branch,
    body: `${draft.meta.deck}\n\n---\nSubmitted from the BSSw contributor editor by @${s.user.login}.\n\n- [ ] Editorial review\n- [ ] Topics and tracks confirmed\n- [ ] Images have alt text`
  });
  return pr.html_url;
}
