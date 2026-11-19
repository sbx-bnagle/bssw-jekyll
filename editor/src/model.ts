import yaml from 'js-yaml';

export interface PostMeta {
  title: string;
  slug: string;
  date?: string;            // YYYY-MM-DD
  authors: string[];
  deck: string;
  topics: string[];
  tracks: string[];
  hero_image?: string;
  hero_image_alt?: string;
  hero_image_caption?: string;
}

export interface RemoteRef {
  repo: string;            // owner/name the branch lives in (upstream or fork)
  branch: string;
  path: string;            // _drafts/<slug>.md or _posts/<date>-<slug>.md
  sha?: string;
  prUrl?: string;
}

export interface Draft {
  id: string;
  meta: PostMeta;
  body: string;
  updatedAt: number;
  remote?: RemoteRef;
  /** updatedAt of the version last saved to GitHub. */
  remoteSavedAt?: number;
  slugEdited?: boolean;
  /** Images added in the editor: site path (/images/x.png) -> data URL, until committed. */
  uploads: Record<string, string>;
  /** Uploads already committed to the branch. */
  committed: string[];
  /** Author entries created in the editor, written to _data/authors.yml on save. */
  newAuthors: Record<string, { name: string; github?: string }>;
}

/** Rails String#parameterize, as used for BSSw slugs. */
export function slugify(s: string): string {
  return s.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

export function newDraft(): Draft {
  return {
    id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    meta: { title: '', slug: '', authors: [], deck: '', topics: [], tracks: [] },
    body: '',
    updatedAt: Date.now(),
    uploads: {},
    committed: [],
    newAuthors: {}
  };
}

const ORDER: (keyof PostMeta)[] = ['title', 'slug', 'date', 'authors', 'deck', 'topics', 'tracks', 'hero_image', 'hero_image_alt', 'hero_image_caption'];

/** Front matter + body, in the key order of docs/templates/blog-post.md. */
export function serialize(meta: PostMeta, body: string): string {
  const ordered: Record<string, unknown> = {};
  for (const key of ORDER) {
    const v = meta[key];
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0 && key !== 'authors' && key !== 'topics')) continue;
    ordered[key] = v;
  }
  let fm = yaml.dump(ordered, { lineWidth: -1, quotingType: '"' });
  fm = fm.replace(/^date: ["'](\d{4}-\d{2}-\d{2})["']$/m, 'date: $1'); // Jekyll wants a bare date
  return `---\n${fm}---\n\n${body.replace(/^\n+/, '')}${body.endsWith('\n') ? '' : '\n'}`;
}

export function parse(text: string): { meta: PostMeta; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const fm = (m ? yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) : {}) as Record<string, any> || {};
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  return {
    meta: {
      title: fm.title ?? '',
      slug: fm.slug ?? '',
      date: fm.date ? String(fm.date).slice(0, 10) : undefined,
      authors: list(fm.authors),
      deck: fm.deck ?? '',
      topics: list(fm.topics),
      tracks: list(fm.tracks),
      hero_image: fm.hero_image || undefined,
      hero_image_alt: fm.hero_image_alt || undefined,
      hero_image_caption: fm.hero_image_caption || undefined
    },
    body: (m ? m[2] : text).replace(/^\n+/, '')
  };
}

/** Required-field check against schemas/blog-post.schema.json. */
export function problems(meta: PostMeta): string[] {
  const out: string[] = [];
  if (!meta.title.trim()) out.push('Add a title.');
  if (!meta.authors.length) out.push('Add at least one author.');
  if (!meta.deck.trim()) out.push('Add a summary (deck).');
  if (!meta.topics.length) out.push('Pick at least one topic.');
  if (meta.hero_image && !meta.hero_image_alt) out.push('Add alt text for the hero image.');
  return out;
}
