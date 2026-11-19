import './styles.css';
import { completeSignIn, getToken, oauthConfigured, signIn, signOut } from './auth';
import { componentAt, toLiquid, type ComponentMatch } from './components';
import { componentDialog } from './componentDialog';
import { config } from './config';
import { components, setAuthors, type ComponentDef } from './data';
import { createEditor, type Editor } from './editor';
import { GitHubError } from './github';
import type { ImageContext } from './imageField';
import { renderMetaPanel } from './metaPanel';
import { newDraft, problems, slugify, type Draft } from './model';
import { Preview, imageUrl } from './preview';
import { deleteLocal, lastOpenId, listLocal, loadLocal, saveLocal } from './store';
import { fetchAuthors, listRemote, loadRemote, openSession, saveDraft, submitForReview, type Session } from './sync';
import { h, modal, readFileAsDataUrl, toast } from './ui';

let draft: Draft = (lastOpenId() && loadLocal(lastOpenId()!)) || newDraft();
let session: Session | null = null;
let accountState: 'checking' | 'signed-out' | 'signed-in' = 'checking';
let mode: 'markdown' | 'preview' = 'markdown';
let cursorComponent: ComponentMatch | undefined;
let loading = false;
let busy = false;
let editor: Editor;
let preview: Preview;

// ------------------------------------------------------------------ layout --

const GITHUB_MARK = '<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

const statusEl = h('span', { class: 'status', 'aria-live': 'polite' });
const accountEl = h('div', { class: 'account' });
const saveBtn = h('button', { class: 'btn btn-primary', onclick: () => void save() }, 'Save draft');
const submitBtn = h('button', { class: 'btn', onclick: () => void submit() }, 'Submit for review');
const metaEl = h('aside', { class: 'meta-panel', 'aria-label': 'Post details' });
const mdPane = h('div', { class: 'pane pane-markdown', role: 'tabpanel', id: 'pane-markdown', 'aria-labelledby': 'tab-markdown' });
const previewStatus = h('div', { class: 'preview-status', role: 'status' });
const pvPane = h('div', { class: 'pane pane-preview', role: 'tabpanel', id: 'pane-preview', 'aria-labelledby': 'tab-preview', hidden: true }, previewStatus);
const tab = (id: 'markdown' | 'preview', label: string) => h('button', {
  role: 'tab', id: `tab-${id}`, 'aria-controls': `pane-${id}`, class: 'tab', onclick: () => setMode(id)
}, label);
const tabMd = tab('markdown', 'Markdown');
const tabPv = tab('preview', 'Preview');
const editBtn = h('button', { class: 'btn btn-small btn-accent', hidden: true, onclick: () => cursorComponent && void editComponent(cursorComponent) }, 'Edit component');
const insertBar = h('div', { class: 'insert-bar', role: 'toolbar', 'aria-label': 'Insert a component' },
  h('span', { class: 'insert-label' }, 'Insert'),
  ...components.map((def) => h('button', { class: 'btn btn-small', title: def.description, onclick: () => void insertComponent(def) }, def.label)),
  editBtn);

document.getElementById('app')!.append(
  h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: config.siteUrl + '/', target: '_blank', rel: 'noopener' },
      h('img', { src: `${config.siteUrl}/assets/bss-logo.svg`, alt: 'Better Scientific Software', height: 34 }),
      h('span', { class: 'brand-sub' }, 'Contributor editor')),
    h('nav', { class: 'doc-actions', 'aria-label': 'Draft' },
      h('button', { class: 'btn btn-ghost', onclick: () => void openDrafts() }, 'Drafts'),
      h('button', { class: 'btn btn-ghost', onclick: () => newPost() }, 'New'),
      saveBtn, submitBtn),
    accountEl),
  h('main', { class: 'workspace' },
    metaEl,
    h('section', { class: 'doc', 'aria-label': 'Post body' },
      h('div', { class: 'doc-toolbar' },
        h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'View' }, tabMd, tabPv),
        insertBar,
        statusEl),
      mdPane, pvPane)));

// ------------------------------------------------------------ draft state --

const imageCtx: ImageContext = {
  async upload(file) {
    if (file.size > 5 * 1024 * 1024) toast('Images over 5 MB slow the site down; consider resizing.', 'error');
    const dataUrl = await readFileAsDataUrl(file);
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] || file.type.split('/')[1] || 'png').toLowerCase();
    const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
    const prefix = `/images/${draft.meta.slug || 'draft'}-${base}`;
    let path = `${prefix}.${ext}`;
    for (let n = 2; draft.uploads[path] && draft.uploads[path] !== dataUrl; n++) path = `${prefix}-${n}.${ext}`;
    draft.uploads[path] = dataUrl;
    touch();
    return path;
  },
  resolve: (path) => imageUrl(draft, path)
};

let saveTimer: number | undefined;
let previewTimer: number | undefined;
let savedLocallyAt = 0;

function touch() {
  if (loading) return;
  draft.updatedAt = Date.now();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!saveLocal(draft)) toast('This browser is out of storage; save to GitHub to keep your work.', 'error');
    savedLocallyAt = Date.now();
    renderStatus();
  }, 400);
  if (mode === 'preview') {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => void preview.update(draft), 250);
  }
  renderStatus();
}

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function renderStatus() {
  const parts: (Node | string)[] = [];
  parts.push(savedLocallyAt ? `Saved on this device ${time(savedLocallyAt)}` : 'Saved on this device');
  if (draft.remote) {
    const url = `https://github.com/${draft.remote.repo}/tree/${draft.remote.branch}`;
    const current = (draft.remoteSavedAt ?? 0) >= draft.updatedAt;
    parts.push(' · ', h('a', { href: url, target: '_blank', rel: 'noopener' }, current ? 'Saved to GitHub' : 'Changes not on GitHub yet'));
    if (draft.remote.prUrl) parts.push(' · ', h('a', { href: draft.remote.prUrl, target: '_blank', rel: 'noopener' }, 'Pull request'));
  }
  statusEl.replaceChildren(...parts);
  saveBtn.disabled = busy;
  submitBtn.disabled = busy;
}

function renderMeta() {
  renderMetaPanel(metaEl, draft, { image: imageCtx, user: () => session?.user ?? null, changed: touch });
}

function switchTo(next: Draft) {
  loading = true;
  draft = next;
  editor.setDoc(next.body);
  loading = false;
  renderMeta();
  saveLocal(draft);
  savedLocallyAt = Date.now();
  renderStatus();
  if (mode === 'preview') void preview.update(draft);
}

function newPost() {
  saveLocal(draft);
  switchTo(newDraft());
  setMode('markdown');
  (metaEl.querySelector('input') as HTMLInputElement | null)?.focus();
}

// ----------------------------------------------------------- view toggle --

function setMode(next: 'markdown' | 'preview') {
  mode = next;
  tabMd.setAttribute('aria-selected', String(next === 'markdown'));
  tabPv.setAttribute('aria-selected', String(next === 'preview'));
  tabMd.tabIndex = next === 'markdown' ? 0 : -1;
  tabPv.tabIndex = next === 'preview' ? 0 : -1;
  mdPane.hidden = next !== 'markdown';
  pvPane.hidden = next !== 'preview';
  insertBar.classList.toggle('is-disabled', next !== 'markdown');
  insertBar.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = next !== 'markdown'; });
  if (next === 'preview') void preview.update(draft);
  else editor.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    setMode(mode === 'markdown' ? 'preview' : 'markdown');
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void save();
  }
});
[tabMd, tabPv].forEach((t) => t.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { setMode(mode === 'markdown' ? 'preview' : 'markdown'); (mode === 'markdown' ? tabMd : tabPv).focus(); }
}));

// ------------------------------------------------------------- components --

async function insertComponent(def: ComponentDef, initial: Record<string, string> = {}, at?: number) {
  const values = await componentDialog(def, initial, imageCtx, false);
  if (!values) return;
  editor.insertBlock(toLiquid(def, values, editor.getDoc()), at);
}

async function editComponent(match: ComponentMatch) {
  const values = await componentDialog(match.def, match.values, imageCtx, true);
  if (!values) return;
  // Re-locate in case the document changed while the dialog was open.
  const fresh = componentAt(editor.getDoc(), match.from) ?? match;
  editor.insertBlock(toLiquid(fresh.def, values, editor.getDoc(), fresh), undefined, { from: fresh.from, to: fresh.to });
}

// ----------------------------------------------------------------- GitHub --

function requireSession(action: string): Session | null {
  if (session) return session;
  modal('Sign in with GitHub', h('p', {}, `Sign in to ${action}. Until then, your work is saved in this browser.`), [
    { label: 'Not now', onClick: () => undefined },
    { label: 'Sign in with GitHub', primary: true, onClick: () => { startSignIn(); } }
  ]);
  return null;
}

function startSignIn() {
  if (!oauthConfigured()) {
    modal('GitHub sign-in isn\'t configured', h('div', {},
      h('p', {}, 'This editor needs a GitHub OAuth App:'),
      h('ol', {},
        h('li', {}, 'GitHub › Settings › Developer settings › OAuth Apps › New OAuth App.'),
        h('li', {}, `Homepage URL and callback URL: ${location.origin}${location.pathname}`),
        h('li', {}, 'Copy editor/.env.example to editor/.env.local and fill in VITE_GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.'),
        h('li', {}, 'Restart the dev server.'))), [{ label: 'OK', primary: true, onClick: () => undefined }]);
    return;
  }
  saveLocal(draft);
  signIn();
}

async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  busy = true;
  const original = statusEl.textContent;
  statusEl.textContent = label;
  saveBtn.disabled = submitBtn.disabled = true;
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof GitHubError && e.status === 401 ? 'Your GitHub session expired. Sign in again.' : (e as Error).message;
    if (e instanceof GitHubError && e.status === 401) { signOut(); session = null; accountState = 'signed-out'; renderAccount(); }
    toast(msg, 'error', 8000);
    statusEl.textContent = original;
    return undefined;
  } finally {
    busy = false;
    renderStatus();
  }
}

async function save() {
  const s = requireSession('save drafts to GitHub');
  if (!s || busy) return;
  if (!draft.meta.title.trim() || !draft.meta.slug) { toast('Add a title before saving to GitHub.', 'error'); return; }
  const stamp = draft.updatedAt;
  const saved = await withBusy('Saving to GitHub…', () => saveDraft(s, draft));
  if (!saved) return;
  draft.remoteSavedAt = stamp;
  saveLocal(draft);
  renderMeta();
  renderStatus();
  toast('Draft saved to GitHub.', 'ok');
}

async function submit() {
  const s = requireSession('submit posts for review');
  if (!s || busy) return;
  const issues = problems(draft.meta);
  if (issues.length) {
    modal('Almost ready', h('div', {}, h('p', {}, 'Before submitting:'), h('ul', {}, ...issues.map((i) => h('li', {}, i)))), [{ label: 'OK', primary: true, onClick: () => undefined }]);
    return;
  }
  modal('Submit for review?', h('div', {},
    h('p', {}, 'This saves your latest changes, moves the post to ', h('code', {}, `_posts/`), ' on your draft branch, and opens a pull request for the BSSw editors.'),
    h('p', { class: 'muted' }, 'You can keep editing afterwards; saving updates the same pull request.')), [
    { label: 'Cancel', onClick: () => undefined },
    {
      label: 'Submit', primary: true,
      onClick: async () => {
        if (!draft.remote) { await save(); if (!draft.remote) return; }
        const stamp = draft.updatedAt;
        const url = await withBusy('Submitting…', () => submitForReview(s, draft));
        if (!url) return;
        draft.remote!.prUrl = url;
        draft.remoteSavedAt = stamp;
        saveLocal(draft);
        renderMeta();
        renderStatus();
        toast('Submitted. The pull request link is in the status bar.', 'ok', 6000);
      }
    }
  ]);
}

async function openDrafts() {
  const local = listLocal();
  const remoteList = h('ul', { class: 'draft-list' }, h('li', { class: 'muted' }, session ? 'Loading…' : 'Sign in to see drafts saved on GitHub.'));
  const close = modal('Drafts', h('div', {},
    h('h3', {}, 'On this device'),
    h('ul', { class: 'draft-list' }, ...(local.length ? local.map((d) => h('li', {},
      h('button', { class: 'linkish', onclick: () => { const l = loadLocal(d.id); if (l) { saveLocal(draft); switchTo(l); } close(); } }, d.title),
      h('span', { class: 'muted' }, ` ${new Date(d.updatedAt).toLocaleString()}`, d.branch ? ' · on GitHub' : ''),
      d.id !== draft.id ? h('button', { class: 'btn btn-small btn-ghost', 'aria-label': `Delete ${d.title} from this device`, onclick: (e: Event) => { deleteLocal(d.id); (e.target as HTMLElement).closest('li')?.remove(); } }, 'Remove') : h('span', { class: 'badge' }, 'Open'))) : [h('li', { class: 'muted' }, 'None yet.')])),
    h('h3', {}, 'On GitHub'),
    remoteList), [{ label: 'Close', onClick: () => undefined }], { wide: true });
  if (!session) return;
  const s = session;
  const remote = await listRemote(s).catch((e) => { toast((e as Error).message, 'error'); return []; });
  remoteList.replaceChildren(...(remote.length ? remote.map((r) => h('li', {},
    h('button', { class: 'linkish', onclick: async () => {
      close();
      const existing = listLocal().find((d) => d.branch === r.branch);
      const loaded = await withBusy('Loading from GitHub…', () => loadRemote(s, r));
      if (!loaded) { toast('That draft branch has no post file.', 'error'); return; }
      const base = (existing && loadLocal(existing.id)) || newDraft();
      saveLocal(draft);
      switchTo({ ...base, ...loaded, updatedAt: Date.now(), remoteSavedAt: Date.now() });
    } }, r.slug),
    h('span', { class: 'muted' }, ` ${r.branch}`))) : [h('li', { class: 'muted' }, 'No drafts on GitHub yet.')]));
}

function renderAccount() {
  if (accountState === 'checking') { accountEl.replaceChildren(h('span', { class: 'muted' }, 'Checking sign-in…')); return; }
  if (!session) {
    const btn = h('button', { class: 'btn btn-github', onclick: startSignIn });
    btn.innerHTML = `${GITHUB_MARK}<span>Sign in with GitHub</span>`;
    accountEl.replaceChildren(btn);
    return;
  }
  const s = session;
  accountEl.replaceChildren(
    s.viaFork ? h('span', { class: 'badge', title: `You don't have write access to ${config.repo}, so drafts go to your fork ${s.target}.` }, 'Saving to your fork') : '',
    h('img', { class: 'avatar', src: s.user.avatar_url, alt: '' }),
    h('span', { class: 'login' }, s.user.login),
    h('button', { class: 'btn btn-small btn-ghost', onclick: () => { signOut(); session = null; accountState = 'signed-out'; renderAccount(); renderMeta(); toast('Signed out. Your drafts stay on this device.'); } }, 'Sign out'));
}

function setPreviewStatus(state: 'loading' | 'ready' | 'error', message?: string) {
  previewStatus.hidden = state === 'ready';
  previewStatus.className = `preview-status ${state}`;
  previewStatus.textContent = state === 'loading' ? 'Loading the site preview…' : message || '';
}

// ------------------------------------------------------------------- boot --

async function boot() {
  editor = createEditor(mdPane, draft.body, {
    onChange(doc) { if (loading) return; draft.body = doc; touch(); },
    onCursor(pos) {
      cursorComponent = componentAt(editor.getDoc(), pos);
      editBtn.hidden = !cursorComponent;
      if (cursorComponent) editBtn.textContent = `Edit ${cursorComponent.def.label.toLowerCase()}`;
    },
    onEditComponent: (m) => void editComponent(m),
    async onImage(file, pos) {
      const path = await imageCtx.upload(file);
      const figure = components.find((c) => c.id === 'figure');
      if (figure) await insertComponent(figure, { src: path }, pos);
    }
  });
  preview = new Preview(setPreviewStatus);
  pvPane.append(preview.frame);
  renderMeta();
  setMode('markdown');
  renderStatus();
  renderAccount();

  const error = await completeSignIn();
  if (error) toast(error, 'error', 8000);
  const token = getToken();
  if (token) {
    try {
      session = await openSession(token);
      const fresh = await fetchAuthors(session).catch(() => null);
      if (fresh) setAuthors(fresh);
      renderMeta();
    } catch (e) {
      if (e instanceof GitHubError && e.status === 401) { signOut(); toast('Your GitHub session expired. Sign in again.', 'error'); }
      else toast(`Couldn't reach GitHub: ${(e as Error).message}`, 'error', 8000);
    }
  }
  accountState = session ? 'signed-in' : 'signed-out';
  renderAccount();
}

void boot();
