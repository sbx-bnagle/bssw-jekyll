# BSSw contributor editor

A Markdown editor for BSSw blog posts. Contributors sign in with GitHub, insert
blog components through forms, and switch between the Markdown and a preview
rendered by the real site. Drafts save to GitHub as branches and are
submitted as pull requests.

## Run it

```bash
cd editor
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev                  # http://localhost:5173
```

Everything except saving to GitHub works without configuration: drafts
autosave in the browser, and the preview uses the site set in `VITE_SITE_URL`.

### GitHub sign-in

1. GitHub › Settings › Developer settings › **OAuth Apps** › New OAuth App
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/`
2. In `.env.local`, set `VITE_GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
3. Restart `npm run dev`.

Exchanging the OAuth code for a token needs the client secret, so it can't
happen in the browser. In development the Vite server handles it
(`vite.config.ts` → `server/exchange.js`). In production, deploy
`worker/auth-worker.js` (Cloudflare Worker; see `worker/wrangler.toml.example`)
and point `VITE_AUTH_URL` at it.

The token has the `public_repo` scope and is kept in this origin's
localStorage until the contributor signs out.

## How it works

| Piece | Where |
| --- | --- |
| Components | `../_includes/components/*.html` (Jekyll includes), fields in `../_data/components.json` |
| Rendering | `src/pipeline.js`: LiquidJS renders the same include files, then `marked` configured to behave like the site's Redcarpet |
| Preview | `src/preview.ts`: iframe of the site's `/preview/blog-post`, driven by `../assets/js/preview-bridge.js` |
| Post details | `src/metaPanel.ts`: front matter form (schema: `../schemas/blog-post.schema.json`) |
| GitHub | `src/sync.ts`: branch `drafts/<login>/<slug>`, file `_drafts/<slug>.md`; submit moves it to `_posts/<date>-<slug>.md` and opens a PR. Contributors without push access use a fork. |
| Local autosave | `src/store.ts` (localStorage) |

### Adding a component

1. Add `_includes/components/<name>.html`. Use string parameters only
   (`include.x`), and don't name a parameter `size`, because
   `include.size` is Liquid's hash size.
2. Describe its fields in `_data/components.json`. Field types: `text`,
   `textarea`, `url`, `select`, `checkbox`, `image`, `markdown`. A `markdown`
   field is written as a `{% capture %}` block above the include.
3. Add an example to `../preview/components.md`, rebuild the site, and run
   `npm test`. The parity test checks that the editor renders the page
   exactly as Jekyll does.

The editor picks up new components automatically; nothing in `src/` needs to
change.

## Tests

```bash
(cd .. && bundle exec jekyll build)   # parity test reads _site/
npm test
```

- `test/parity.mjs`: the editor pipeline against Jekyll's output for
  `preview/components.md`.
- `test/sync.test.mjs`: save, update, list, load and submit, plus the fork
  flow, against an in-memory GitHub API.

## Shortcuts

| Keys | Action |
| --- | --- |
| ⌘/Ctrl + E | Switch between Markdown and Preview |
| ⌘/Ctrl + S | Save draft to GitHub |
| ⌘/Ctrl + B / I / K | Bold / italic / link |
| Double-click a component tag | Edit the component |
| Drop or paste an image | Upload it and insert a figure |
