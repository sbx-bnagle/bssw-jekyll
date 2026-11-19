// "Post details": the front matter, as a form.
import { authors, categories, tracks } from './data';
import type { GitHubUser } from './github';
import { problems, slugify, type Draft } from './model';
import { imageField, type ImageContext } from './imageField';
import { field, h } from './ui';

export interface MetaContext {
  image: ImageContext;
  user(): GitHubUser | null;
  changed(): void;
}

export function renderMetaPanel(root: HTMLElement, draft: Draft, ctx: MetaContext) {
  const m = draft.meta;
  const issues = h('ul', { class: 'problems', 'aria-live': 'polite' });
  const update = () => {
    issues.replaceChildren(...problems(m).map((p) => h('li', {}, p)));
    ctx.changed();
  };

  // Title + slug
  const slugLocked = Boolean(draft.remote);
  const slug = h('input', {
    type: 'text', value: m.slug, readonly: slugLocked, spellcheck: 'false',
    oninput: () => { m.slug = slugify(slug.value); draft.slugEdited = true; update(); },
    onblur: () => { slug.value = m.slug; }
  });
  const title = h('input', {
    type: 'text', value: m.title, placeholder: 'Post title',
    oninput: () => {
      m.title = title.value;
      if (!draft.slugEdited && !slugLocked) { m.slug = slugify(m.title); slug.value = m.slug; }
      update();
    }
  });

  const date = h('input', { type: 'date', value: m.date || '', onchange: () => { m.date = date.value || undefined; update(); } });

  // Authors
  const chips = h('div', { class: 'chips' });
  const nameOf = (s: string) => draft.newAuthors[s]?.name || authors[s]?.name || s;
  const drawChips = () => chips.replaceChildren(...m.authors.map((s) => h('span', { class: 'chip' }, nameOf(s),
    h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${nameOf(s)}`, onclick: () => { m.authors = m.authors.filter((a) => a !== s); drawChips(); update(); } }, '×'))));
  const listId = 'author-options';
  const options = h('datalist', { id: listId }, ...Object.entries(authors).map(([s, a]) => h('option', { value: `${a.name} (${s})` })));
  const addAuthor = (s: string) => { if (!m.authors.includes(s)) m.authors.push(s); drawChips(); update(); };
  const picker = h('input', {
    type: 'text', list: listId, placeholder: 'Type a name…',
    onchange: () => {
      const s = /\(([a-z0-9-]+)\)\s*$/.exec(picker.value)?.[1];
      if (s && authors[s]) { addAuthor(s); picker.value = ''; }
    }
  });
  const user = ctx.user();
  const mine = user ? Object.entries(authors).find(([, a]) => a.github?.toLowerCase() === user.login.toLowerCase())?.[0] : undefined;
  const meBtn = user ? h('button', {
    type: 'button', class: 'btn btn-small',
    onclick: () => {
      if (mine) return addAuthor(mine);
      const name = user.name || user.login;
      const s = slugify(name);
      draft.newAuthors[s] = { name, github: user.login };
      addAuthor(s);
    }
  }, mine ? 'Add me' : 'Add me as a new contributor') : null;
  const newName = h('input', { type: 'text', placeholder: 'Full name' });
  const newBox = h('div', { class: 'inline-form', hidden: true }, newName,
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
      const name = newName.value.trim();
      if (!name) return;
      const s = slugify(name);
      if (!authors[s]) draft.newAuthors[s] = { name };
      addAuthor(s); newName.value = ''; newBox.hidden = true;
    } }, 'Add'));
  drawChips();

  // Topics, grouped by category
  const topicGroups = categories.map((c) => {
    const count = h('span', { class: 'count' });
    const setCount = () => { const n = c.topics.filter((t) => m.topics.includes(t.slug)).length; count.textContent = n ? ` (${n})` : ''; };
    setCount();
    return h('details', { class: 'topic-group', open: c.topics.some((t) => m.topics.includes(t.slug)) },
      h('summary', {}, c.name, count),
      ...c.topics.map((t) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: m.topics.includes(t.slug), onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked;
          m.topics = on ? [...m.topics, t.slug] : m.topics.filter((x) => x !== t.slug);
          setCount(); update();
        } }),
        h('span', { title: t.overview || '' }, t.name))));
  });

  const trackBoxes = tracks.map((t) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: m.tracks.includes(t.slug), onchange: (e: Event) => {
      const on = (e.target as HTMLInputElement).checked;
      m.tracks = on ? [...m.tracks, t.slug] : m.tracks.filter((x) => x !== t.slug);
      update();
    } }),
    h('span', { title: t.description || '' }, t.name)));

  const deck = h('textarea', { rows: 4, value: m.deck, oninput: () => { m.deck = deck.value; update(); } });
  const heroAlt = h('input', { type: 'text', value: m.hero_image_alt || '', oninput: () => { m.hero_image_alt = heroAlt.value || undefined; update(); } });
  const heroCaption = h('input', { type: 'text', value: m.hero_image_caption || '', oninput: () => { m.hero_image_caption = heroCaption.value || undefined; update(); } });

  root.replaceChildren(
    h('h2', { class: 'panel-title' }, 'Post details'),
    field('Title', title, undefined, true),
    field('URL slug', slug, slugLocked ? `Fixed after the first save to GitHub (it names the draft branch). URL: /blog_posts/${m.slug}` : `URL: /blog_posts/<slug>`),
    field('Publication date', date, 'Leave empty while drafting; editors set it when publishing.'),
    h('div', { class: 'field' },
      h('span', { class: 'label' }, 'Authors', h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
      chips, picker, options,
      h('div', { class: 'row-actions' }, meBtn,
        h('button', { type: 'button', class: 'btn btn-small btn-link', onclick: () => { newBox.hidden = !newBox.hidden; if (!newBox.hidden) newName.focus(); } }, 'New contributor…')),
      newBox),
    field('Summary (deck)', deck, 'One paragraph. Shown under the title, in listings and in social cards.', true),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Topics', h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')), ...topicGroups),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Blog tracks'), h('div', { class: 'checks' }, ...trackBoxes)),
    h('details', { class: 'hero-group', open: Boolean(m.hero_image) },
      h('summary', {}, 'Hero image (optional)'),
      field('Image', imageField(m.hero_image || '', ctx.image, (p) => { m.hero_image = p || undefined; update(); })),
      field('Alt text', heroAlt),
      field('Caption', heroCaption)),
    issues
  );
  issues.replaceChildren(...problems(m).map((p) => h('li', {}, p)));
}
