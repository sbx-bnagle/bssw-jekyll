// Render parity: the editor's pipeline (LiquidJS + marked) vs. Jekyll's build
// (Liquid + Redcarpet) for preview/components.md, which uses every component.
//
//   cd .. && bundle exec jekyll build && cd editor && npm test
//
// Compares the content region tag-by-tag (whitespace-insensitive).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPipeline } from '../src/pipeline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const incDir = path.join(root, '_includes/components');
const templates = Object.fromEntries(fs.readdirSync(incDir).map((f) => [`components/${f}`, fs.readFileSync(path.join(incDir, f), 'utf8')]));
const pipeline = createPipeline(templates);

const source = fs.readFileSync(path.join(root, 'preview/components.md'), 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
const built = fs.readFileSync(path.join(root, '_site/preview/components.html'), 'utf8');

// Jekyll content region: <div class="content"> ... up to the end of the post body column.
const start = built.indexOf('<div class="content">', built.indexOf('post-event-content'));
const end = built.indexOf('<div class="blog-post-footer">');
const jekyllHtml = built.slice(start + '<div class="content">'.length, end);

const normalize = (html) => html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/'/g, '"')
  .replace(/\s*\/>/g, '>')
  .replace(/>\s+</g, '><')
  .replace(/\s+/g, ' ')
  .replace(/(<\/div>\s*)+$/, '') // closing wrappers of the layout
  .trim();

const editorHtml = normalize(await pipeline.renderBody(source));
const expected = normalize(jekyllHtml);
const tokens = (s) => s.split(/(?=<)/);
const a = tokens(expected);
const b = tokens(editorHtml);
let i = 0;
while (i < a.length && i < b.length && a[i] === b[i]) i++;
if (i === a.length && i === b.length) {
  console.log(`parity OK: ${a.length} tokens identical`);
} else {
  console.error(`parity FAILED at token ${i} of ${a.length} (jekyll) / ${b.length} (editor)`);
  console.error('  jekyll:', a.slice(i, i + 4).join(''));
  console.error('  editor:', b.slice(i, i + 4).join(''));
  process.exit(1);
}
