// Draft workflow against an in-memory GitHub API (no network, no credentials).
// Covers: save -> update -> list -> load -> submit (PR) for a contributor with
// push access, and the fork flow for one without.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/sync.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'],
  define: { 'import.meta.env': JSON.stringify({ VITE_CONTENT_REPO: 'bssw/site', VITE_CONTENT_BRANCH: 'main' }) }
});
const sync = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

// ------------------------------------------------------------ fake GitHub --
function fakeGitHub({ push }) {
  let n = 0;
  const sha = () => `sha${++n}`;
  const repos = {
    'bssw/site': {
      branches: { main: { files: { '_data/authors.yml': 'jane-doe:\n  name: Jane Doe\n', 'images/existing.png': 'x' } } },
      pulls: []
    }
  };
  const log = [];
  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  const fileSha = (f) => `blob-${Buffer.from(f).toString('base64').slice(0, 12)}`;

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const path = decodeURIComponent(u.pathname);
    log.push(`${method} ${path}`);
    let m;
    if (path === '/user') return json(200, { login: 'alice', name: 'Alice Example', avatar_url: 'a.png' });
    if ((m = /^\/repos\/([^/]+\/[^/]+)$/.exec(path))) {
      const r = repos[m[1]];
      if (!r) return json(404, { message: 'Not Found' });
      return json(200, { full_name: m[1], name: m[1].split('/')[1], default_branch: 'main', owner: { login: m[1].split('/')[0] }, permissions: { push: m[1] === 'bssw/site' ? push : true } });
    }
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/forks$/.exec(path)) && method === 'POST') {
      repos['alice/site'] = { branches: { main: structuredClone(repos[m[1]].branches.main) }, pulls: [] };
      return json(202, { full_name: 'alice/site', name: 'site', owner: { login: 'alice' }, default_branch: 'main' });
    }
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/merge-upstream$/.exec(path))) return json(200, {});
    const repo = (m = /^\/repos\/([^/]+\/[^/]+)\//.exec(path)) && repos[m[1]];
    if (!repo) return json(404, { message: 'Not Found' });
    const rest = path.slice(m[0].length);
    if ((m = /^git\/ref\/heads\/(.+)$/.exec(rest))) {
      return repo.branches[m[1]] ? json(200, { object: { sha: `head-${m[1]}` } }) : json(404, { message: 'Not Found' });
    }
    if (rest === 'git/refs' && method === 'POST') {
      const name = body.ref.replace('refs/heads/', '');
      repo.branches[name] = { files: structuredClone(repo.branches.main.files) };
      return json(201, {});
    }
    if ((m = /^git\/matching-refs\/heads\/(.+)$/.exec(rest))) {
      return json(200, Object.keys(repo.branches).filter((b) => b.startsWith(m[1])).map((b) => ({ ref: `refs/heads/${b}` })));
    }
    if ((m = /^contents\/(.+)$/.exec(rest))) {
      const file = m[1];
      const ref = u.searchParams.get('ref') || body?.branch || 'main';
      const files = repo.branches[ref]?.files;
      if (!files) return json(404, { message: 'No branch' });
      if (method === 'GET') {
        if (files[file] !== undefined) return json(200, { content: Buffer.from(files[file]).toString('base64'), sha: fileSha(files[file]) });
        const dir = Object.keys(files).filter((f) => f.startsWith(`${file}/`));
        return dir.length ? json(200, dir.map((f) => ({ name: f.split('/').pop(), path: f }))) : json(404, { message: 'Not Found' });
      }
      if (method === 'PUT') {
        if (files[file] !== undefined && body.sha !== fileSha(files[file])) return json(409, { message: 'sha mismatch' });
        if (files[file] === undefined && body.sha) return json(422, { message: 'sha given for new file' });
        files[file] = Buffer.from(body.content, 'base64').toString('utf8');
        return json(200, { content: { sha: fileSha(files[file]) } });
      }
      if (method === 'DELETE') {
        if (body.sha !== fileSha(files[file])) return json(409, { message: 'sha mismatch' });
        delete files[file];
        return json(200, {});
      }
    }
    if (rest.startsWith('pulls')) {
      if (method === 'POST') { const pr = { ...body, html_url: `https://github.com/bssw/site/pull/${repo.pulls.length + 1}` }; repo.pulls.push(pr); return json(201, pr); }
      return json(200, repo.pulls.filter((p) => p.head === u.searchParams.get('head')));
    }
    return json(404, { message: `unhandled ${method} ${path}` });
  };
  return { repos, log, sha };
}

function makeDraft() {
  return {
    id: 'd1', updatedAt: 1, committed: [],
    meta: { title: 'Property Tests', slug: 'property-tests', authors: ['alice-example'], deck: 'Deck.', topics: ['testing'], tracks: [] },
    body: '{% include components/figure.html src="/images/property-tests-chart.png" alt="Chart" %}\n',
    uploads: { '/images/property-tests-chart.png': 'data:image/png;base64,iVBORw0KGgo=' },
    newAuthors: { 'alice-example': { name: 'Alice Example', github: 'alice' } }
  };
}

// --------------------------------------------------------- push access ----
{
  const gh = fakeGitHub({ push: true });
  const s = await sync.openSession('token');
  assert.equal(s.target, 'bssw/site');
  assert.equal(s.viaFork, false);

  const d = await sync.saveDraft(s, makeDraft());
  const files = gh.repos['bssw/site'].branches['drafts/alice/property-tests'].files;
  assert.ok(files['_drafts/property-tests.md'].startsWith('---\ntitle: Property Tests\n'), 'draft file written with front matter');
  assert.ok(files['_drafts/property-tests.md'].includes('{% include components/figure.html'), 'body written');
  assert.equal(files['images/property-tests-chart.png'].length > 0, true, 'upload committed');
  assert.match(files['_data/authors.yml'], /alice-example:\n  name: "Alice Example"\n  github: alice\n/, 'new contributor appended');
  assert.deepEqual(d.newAuthors, {});
  assert.equal(d.remote.path, '_drafts/property-tests.md');

  // Second save updates in place (sha round-trip), doesn't re-upload images.
  d.body += '\nMore text.\n';
  const puts = gh.log.filter((l) => l.startsWith('PUT')).length;
  await sync.saveDraft(s, d);
  assert.equal(gh.log.filter((l) => l.startsWith('PUT')).length, puts + 1, 'only the post file is re-written');
  assert.ok(files['_drafts/property-tests.md'].endsWith('More text.\n'));

  const list = await sync.listRemote(s);
  assert.deepEqual(list, [{ branch: 'drafts/alice/property-tests', slug: 'property-tests' }]);
  const loaded = await sync.loadRemote(s, list[0]);
  assert.equal(loaded.meta.title, 'Property Tests');
  assert.deepEqual(loaded.meta.topics, ['testing']);

  const url = await sync.submitForReview(s, d);
  assert.equal(url, 'https://github.com/bssw/site/pull/1');
  assert.equal(files['_drafts/property-tests.md'], undefined, 'draft moved out of _drafts');
  const postPath = Object.keys(files).find((f) => f.startsWith('_posts/'));
  assert.match(postPath, /^_posts\/\d{4}-\d{2}-\d{2}-property-tests\.md$/);
  assert.match(files[postPath], /\ndate: \d{4}-\d{2}-\d{2}\n/, 'bare YAML date set on submit');
  const pr = gh.repos['bssw/site'].pulls[0];
  assert.equal(pr.head, 'bssw:drafts/alice/property-tests');
  assert.equal(pr.base, 'main');

  // Loading a submitted draft finds it in _posts; re-submitting reuses the PR.
  assert.equal((await sync.loadRemote(s, list[0])).remote.path, postPath);
  assert.equal(await sync.submitForReview(s, d), url);
  assert.equal(gh.repos['bssw/site'].pulls.length, 1);
  console.log('sync (push access): OK');
}

// ---------------------------------------------------------- fork flow -----
{
  const gh = fakeGitHub({ push: false });
  const s = await sync.openSession('token');
  assert.equal(s.viaFork, true);
  assert.equal(s.target, 'alice/site');
  const d = await sync.saveDraft(s, makeDraft());
  assert.ok(gh.repos['alice/site'].branches['drafts/alice/property-tests'].files['_drafts/property-tests.md']);
  assert.equal(gh.repos['bssw/site'].branches['drafts/alice/property-tests'], undefined, 'nothing written upstream');
  await sync.submitForReview(s, d);
  assert.equal(gh.repos['bssw/site'].pulls[0].head, 'alice:drafts/alice/property-tests', 'PR from the fork to upstream');
  console.log('sync (fork): OK');
}
