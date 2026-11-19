// @ts-check
/**
 * Browser/Node rendering pipeline that mirrors the Jekyll build:
 *
 *   1. Liquid (the same _includes/components/*.html files, Jekyll include syntax)
 *   2. Markdown, configured to behave like Redcarpet with the Rails options
 *      (_plugins/bssw_markdown.rb): GFM tables/strikethrough/autolink,
 *      no hard breaks, heading ids like `with_toc_data`, and Redcarpet's rule
 *      that only block-level tags start a raw HTML block.
 *
 * Plain ESM with no bundler-specific imports, so test/parity.mjs can run it
 * in Node against Jekyll's output.
 */
import { Liquid } from 'liquidjs';
import { Marked } from 'marked';

// Tags Redcarpet treats as block-level HTML (html_blocks.h), plus HTML5
// sectioning tags that pass through in practice. A line starting with any
// other tag (img, a, span, ...) is a paragraph in Redcarpet.
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'del', 'details', 'dialog', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
  'iframe', 'ins', 'li', 'main', 'math', 'nav', 'noscript', 'ol', 'p', 'pre', 'script', 'section', 'style',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'video'
]);

/**
 * Redcarpet with_toc_data: lowercase, drop tags/entities, non-alphanumerics -> "-".
 * @param {string} html
 */
export function tocId(html) {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z0-9#]+;/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createMarked() {
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${tocId(text)}">${text}</h${depth}>\n`;
      },
      html({ text, block }) {
        if (!block) return text;
        const tag = (/^\s*<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(text) || [])[1];
        if (!tag || text.trimStart().startsWith('<!--') || BLOCK_TAGS.has(tag.toLowerCase())) return text;
        return `<p>${text.trim()}</p>\n`;
      }
    }
  });
}

/**
 * @param {Record<string, string>} templates  include path (e.g. "components/figure.html") -> source
 */
export function createPipeline(templates) {
  const marked = createMarked();
  const engine = new Liquid({
    templates,
    jekyllInclude: true,
    dynamicPartials: false,
    extname: '',
    strictVariables: false,
    strictFilters: false
  });
  engine.registerFilter('markdownify', (s) => marked.parse(String(s ?? '')));
  engine.registerFilter('relative_url', (s) => s);
  engine.registerFilter('absolute_url', (s) => s);

  return {
    marked,
    /** Liquid then Markdown, like a Jekyll .md document. @param {string} source */
    async renderBody(source) {
      const expanded = await engine.parseAndRender(String(source ?? ''));
      return /** @type {string} */ (marked.parse(expanded));
    },
    /** `markdownify` as used for the deck in the layouts. @param {string} source */
    renderDeck(source) {
      return /** @type {string} */ (marked.parse(String(source ?? '')));
    }
  };
}
