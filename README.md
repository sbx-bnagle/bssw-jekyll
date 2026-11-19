# BSSw.io — Jekyll

Static Jekyll rebuild of [bssw.io](https://bssw.io). Markup, styles and URLs
match the Rails app (`Parallactic/bssw.io`). Content comes from the legacy
content repo (`betterscientificsoftware/bssw.io`). This prototype includes
5 entries per repeated content type.

## Run locally

```bash
bundle install
bundle exec jekyll serve          # http://localhost:4000
bundle exec jekyll serve --drafts # also shows _drafts/
```

## Layout of the repo

| Path | What it is | Rails equivalent |
| --- | --- | --- |
| `_posts/` | Blog posts → `/blog_posts/<slug>` (also `/items/<slug>`) | `BlogPost` |
| `_drafts/` | Unpublished blog posts (editor saves here) | `show.draft` |
| `_items/` | Curated resources → `/items/<slug>` | `SiteItem` |
| `_events/` | Events → `/events/<slug>` (also `/items/<slug>`) | `Event` |
| `_site_pages/` | Site pages → `/pages/<slug>` | `Page` |
| `_communities/` | `/communities/<slug>` | `Community` |
| `_fellows/` | `/fellows/<slug>` | `Fellow` |
| `_data/categories.yml` | Categories and topics (`Site/Topics/*.md`) | `Category`, `Topic` |
| `_data/authors.yml` | Contributors keyed by slug (with GitHub login) | `Author` |
| `_data/tracks.yml`, `homepage.yml`, `menus.yml`, `announcement.yml` | Blog tracks, carousel and quotes, hero sub-menus, announcement bar | `Track`, `FeaturedPost`, `Quote`, `Announcement` |
| `assets/application.scss` + `_sass/bssw/` | Upstream SCSS, compiled to `/assets/application.css` | `app/assets/stylesheets` |
| `assets/application.js` | Compiled JS bundle copied from bssw.io | sprockets bundle |
| `assets/js/listing.js` | Client-side `?topic=` `?category=` `?recent=` `?author=` `?track=` `?past=` and search | `resources#index`, `#search` |
| `assets/js/bssw-content.js` | Lightbox and `[caption]` handling for content images | `MarkdownUtility.update_images` |
| `_plugins/` | Redcarpet Markdown (same options as Rails), `/items/<slug>` aliases, Rails helper filters | `GithubImporter`, helpers |
| `api/`, `schemas/`, `preview/` | JSON data, front-matter schema, preview frame and component reference for the editor | (new) |
| `_includes/components/`, `_data/components.json` | Blog components (figure, profile card, link row, collapsible) and their editor fields | raw HTML in posts |
| `editor/` | Contributor editor (Vite app): GitHub sign-in, component forms, Markdown/preview switch. See `editor/README.md` | (new) |

## Importing more content

`scripts/import_legacy.rb` converts legacy BSSw Markdown (H1 title,
`#### Contributed by`, `#### Publication date:`, `<!--- Topics: … --->`) into
files with YAML front matter. It reads through `git show`, so your checkout of
the content repo is never modified.

```bash
ruby scripts/import_legacy.rb --repo ~/Sites/bssw.io --ref origin/main --github-lookup
```

To choose what gets imported, edit `scripts/import_manifest.yml`. The
`--github-lookup` flag fills in author avatars and affiliations from the
GitHub API (set `GITHUB_TOKEN` to avoid rate limits).

## Deploy

`.github/workflows/pages.yml` builds the site with Jekyll 4 (custom plugins
need this; the GitHub Pages "classic" build won't run them) and deploys it
to GitHub Pages. It also rebuilds daily, which keeps the upcoming/past split
on the events page and the announcement window current.

The prototype is served at <https://sbx-bnagle.github.io/bssw-jekyll/>.

- **Subpath:** templates keep root-relative links, as on bssw.io.
  `_plugins/baseurl_links.rb` adds the `/bssw-jekyll` prefix at build time,
  and the JS reads the same prefix from `<html data-baseurl>`. With an empty
  `baseurl` (bssw.io itself, or a custom domain) neither changes anything.
- **Search engines:** the workflow sets `noindex` (`PAGES_NOINDEX`) so this
  copy doesn't compete with bssw.io in search results. Remove it for
  production.

## Known differences from bssw.io

- Images are served from `/images/`, not through Cloudinary. `bssw-content.js`
  imitates the `logo`, `portrait` and `header` size presets.
- The lightbox link and `[caption]` span are added by JavaScript on page
  load. Rails added them on the server. The resulting DOM is the same.
- Listing filters and search run in the browser. Search covers titles,
  topics, authors and body text, but has no Algolia ranking.
- The contact forms post to `contact_form_action` in `_config.yml`, which is
  empty by default. Rails handled them at `/contacts`.
- Disqus counters, Google Analytics, Sentry, and the "Load More" pagination
  are left out (5 entries per type).
