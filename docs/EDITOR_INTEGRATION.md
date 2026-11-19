# Contributor editor: integration points

This is the planned standalone Markdown editor: contributors sign in with
GitHub, write a blog post, switch between Markdown and a preview, and save
drafts. This page lists what the Jekyll site already provides for it.

## 1. Content model

A blog post is one file: YAML front matter followed by a Markdown body.

- Draft: `_drafts/<slug>.md` (no date in the filename)
- Published: `_posts/YYYY-MM-DD-<slug>.md`
- Schema: [`/schemas/blog-post.schema.json`](../schemas/blog-post.schema.json)
- Template: [`docs/templates/blog-post.md`](templates/blog-post.md)

Front matter holds **slugs**, not display names:

| Field | Values come from |
| --- | --- |
| `authors` | keys of `_data/authors.yml` → `GET /api/authors.json` |
| `topics` | `categories[].topics[].slug` → `GET /api/taxonomy.json` |
| `tracks` | `tracks[].slug` → `GET /api/taxonomy.json` |

`GET /api/items.json` lists every post, resource and event (for
duplicate-title checks and link pickers).

To match a signed-in user to a contributor entry, use the `github` field in
`_data/authors.yml`. A first-time contributor needs a new entry in the same
commit (slug = parameterized name, plus `name` and `github`).

## 2. Saving drafts through GitHub

The site has no server. The editor uses the GitHub REST API with the
contributor's token.

1. **Sign-in.** Use a GitHub App with the user-to-server OAuth flow.
   Exchanging the code for a token needs the client secret, so it must run in
   a small serverless function (Cloudflare Worker, Netlify or Vercel
   function). Keep the editor on a different origin from the site.
2. **Save draft.** Create or update `_drafts/<slug>.md` on the branch
   `drafts/<github-login>/<slug>`, using `PUT /repos/{owner}/{repo}/contents/{path}`
   with the file `sha` for updates. Contributors without write access fork
   the repo first, then follow the same steps on their fork.
3. **Images.** Upload images to `images/<slug>-<n>.<ext>` on the same branch
   and reference them as `/images/...`.
4. **Submit.** Open a pull request from the draft branch. When editors are
   ready to publish, the file moves to `_posts/YYYY-MM-DD-<slug>.md` and gets
   a `date`. Run `jekyll serve --drafts` to see drafts locally.

## 3. Live preview with production styles

`/preview/blog-post` is a normal Jekyll render of `_layouts/blog_post.html`,
with the site's CSS, fonts and JS. Embed it and send it the draft:

```html
<iframe id="preview" src="https://bssw.io/preview/blog-post" sandbox="allow-scripts"></iframe>
```

```js
preview.contentWindow.postMessage({
  type: 'bssw:preview',
  post: {
    title, date,                    // 'YYYY-MM-DD'
    authors: ['michael-a-heroux'],  // slugs
    topics: ['peer-code-review'],   // slugs
    tracks: ['deep-dive'],          // slugs
    hero_image, hero_image_caption, // optional
    deck_html: renderInline(deck),  // Markdown → HTML, done by the editor
    body_html: render(body)
  }
}, 'https://bssw.io');
```

The frame posts `{type: 'bssw:preview-ready'}` when it loads, and
`{type: 'bssw:preview-rendered', height}` after each render, so the editor can
resize the iframe. The frame only accepts messages from origins listed in
`preview_allowed_origins` in `_config.yml`. Leave out `allow-same-origin` on
the iframe: the frame then runs in an opaque origin, so draft HTML cannot
reach anything stored on the site's origin.

The bridge runs `BSSWContent.enhance()` on the content, so lightbox images and
`[caption]` text appear the same way as on the published site.

## 4. Markdown parity

The site renders Markdown with **Redcarpet**, using the same options as the
Rails app: `autolink`, `tables`, `lax_spacing`, `strikethrough`,
`fenced_code_blocks`, `no_intra_emphasis`, and `with_toc_data` for heading
ids. See `_plugins/bssw_markdown.rb`. For the browser preview, use
[marked](https://marked.js.org/) with `gfm: true, breaks: false`, and add
heading ids with the same rule (lowercase, then non-alphanumerics → `-`).
Marked and Redcarpet both keep straight quotes and leave raw HTML alone, so
the preview matches the build closely. The authoritative check is the
pull request's build.

Content conventions the preview supports:

- `<img src="/images/x.png" class="page lightbox" alt="…"/>` opens in a lightbox.
- `[Figure 1. …]` right after an image becomes its caption.
- The image classes `logo`, `portrait` and `header` follow the old Cloudinary
  size presets.
