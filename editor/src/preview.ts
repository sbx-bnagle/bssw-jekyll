// Preview: the site's own /preview/blog-post page (production layout, CSS
// and JS) in a sandboxed iframe, driven over postMessage. The draft is
// rendered here with the same Liquid includes and Redcarpet-like Markdown.
import { config } from './config';
import { authors, templates } from './data';
import type { Draft } from './model';
import { createPipeline } from './pipeline.js';
import { h } from './ui';

export const pipeline = createPipeline(templates);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Map /images/... to something the preview can load before the post is merged. */
export function imageUrl(draft: Draft, path: string): string {
  if (draft.uploads[path]) return draft.uploads[path];
  if (draft.remote && path.startsWith('/images/')) {
    return `https://raw.githubusercontent.com/${draft.remote.repo}/${draft.remote.branch}${path}`;
  }
  return path.startsWith('/') ? `${config.siteUrl}${path}` : path;
}

function swapImages(html: string, draft: Draft): string {
  return html.replace(/(src=["']|url\(\s*["']?)(\/images\/[^"')\s]+)/g, (_m, pre: string, path: string) => {
    const url = imageUrl(draft, path);
    return pre + (url.startsWith(config.siteUrl) ? path : url); // site images: let the bridge add the base path
  });
}

const siteOrigin = new URL(config.siteUrl, location.href).origin;
const sameOrigin = siteOrigin === location.origin;

export class Preview {
  readonly frame: HTMLIFrameElement;
  private ready = false;
  private queued: unknown = null;
  private timer?: number;

  constructor(private onStatus: (state: 'loading' | 'ready' | 'error', message?: string) => void) {
    this.frame = h('iframe', {
      class: 'preview-frame',
      title: 'Preview of the post as it will appear on the site',
      // allow-same-origin gives the frame the *site's* origin, which web fonts
      // (Font Awesome's CDN) require. It grants nothing toward the editor as
      // long as the editor is served from a different origin than the site.
      sandbox: sameOrigin ? 'allow-scripts allow-popups' : 'allow-scripts allow-same-origin allow-popups',
      src: `${config.siteUrl}/preview/blog-post`
    });
    window.addEventListener('message', (e) => {
      if (e.source !== this.frame.contentWindow) return;
      if (e.data?.type === 'bssw:preview-ready') {
        this.ready = true;
        window.clearTimeout(this.timer);
        this.onStatus('ready');
        if (this.queued) this.post(this.queued);
      }
    });
    this.onStatus('loading');
    this.timer = window.setTimeout(() => {
      if (!this.ready) {
        this.onStatus('error', `The preview page at ${config.siteUrl}/preview/blog-post didn't respond. Check that the site is running and that its _config.yml lists ${location.origin} in preview_allowed_origins.`);
      }
    }, 10000);
  }

  private post(message: unknown) {
    this.queued = message;
    // Same-origin hosting falls back to an opaque-origin sandbox, which only '*' can target.
    if (this.ready) this.frame.contentWindow?.postMessage(message, sameOrigin ? '*' : siteOrigin);
  }

  async update(draft: Draft) {
    let body: string;
    try {
      body = await pipeline.renderBody(draft.body);
    } catch (err) {
      // Usually an unfinished {% ... %} tag while typing.
      body = `<p style="color:#a94442"><strong>Liquid error:</strong> ${esc((err as Error).message)}</p>` + pipeline.renderDeck(draft.body);
    }
    const meta = draft.meta;
    const authorsData = Object.fromEntries(meta.authors.map((slug) => [slug, draft.newAuthors[slug] || authors[slug] || { name: slug }]));
    this.post({
      type: 'bssw:preview',
      post: {
        title: meta.title || 'Untitled draft',
        date: meta.date || new Date().toISOString().slice(0, 10),
        authors: meta.authors,
        authors_data: authorsData,
        topics: meta.topics,
        tracks: meta.tracks,
        hero_image: meta.hero_image ? imageUrl(draft, meta.hero_image).replace(config.siteUrl, '') : undefined,
        hero_image_caption: meta.hero_image_caption,
        deck_html: pipeline.renderDeck(meta.deck).trim(),
        body_html: swapImages(body, draft)
      }
    });
  }
}
