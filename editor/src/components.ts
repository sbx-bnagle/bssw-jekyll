// Component include tags <-> structured values.
//
// Simple fields become include parameters:
//   {% include components/figure.html src="/images/a.png" alt="..." %}
// Markdown fields are captured just before the include, since Jekyll
// includes can't wrap content:
//   {% capture collapsible_body_1 %}
//   ...Markdown...
//   {% endcapture %}
//   {% include components/collapsible.html summary="..." body=collapsible_body_1 %}
import { components, type ComponentDef, type ComponentField } from './data';

export interface ComponentMatch {
  def: ComponentDef;
  values: Record<string, string>;
  from: number;            // start of the capture block (if any) or the include tag
  to: number;              // end of the include tag
  captures: Record<string, string>; // field name -> capture variable
}

const INCLUDE_RE = /\{%-?\s*include\s+(components\/[\w.-]+\.html)([\s\S]*?)-?%\}/g;
const PARAM_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([\w.-]+))/g;

const unescapeValue = (v: string) => v.replace(/&quot;/g, '"');
const escapeValue = (v: string) => v.replace(/\r?\n+/g, ' ').replace(/"/g, '&quot;');

export function findComponents(doc: string): ComponentMatch[] {
  const out: ComponentMatch[] = [];
  for (const m of doc.matchAll(INCLUDE_RE)) {
    const def = components.find((c) => c.include === m[1]);
    if (!def || m.index === undefined) continue;
    const values: Record<string, string> = {};
    const captures: Record<string, string> = {};
    let from = m.index;
    for (const p of m[2].matchAll(PARAM_RE)) {
      const [, name, dq, sq, bare] = p;
      if (bare !== undefined) {
        // Variable: look for its capture block directly above the include.
        const before = doc.slice(0, from);
        const cap = new RegExp(`\\{%-?\\s*capture\\s+${bare}\\s*-?%\\}\\n?([\\s\\S]*?)\\n?\\{%-?\\s*endcapture\\s*-?%\\}\\s*$`).exec(before);
        if (cap && cap.index !== undefined) {
          values[name] = cap[1];
          captures[name] = bare;
          from = cap.index;
        }
      } else {
        values[name] = unescapeValue(dq ?? sq ?? '');
      }
    }
    out.push({ def, values, from, to: m.index + m[0].length, captures });
  }
  return out;
}

export function componentAt(doc: string, pos: number): ComponentMatch | undefined {
  return findComponents(doc).find((c) => pos >= c.from && pos <= c.to);
}

export function defaults(def: ComponentDef): Record<string, string> {
  return Object.fromEntries(def.fields.map((f) => [f.name, f.default ?? '']));
}

export function isVisible(field: ComponentField, values: Record<string, string>): boolean {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([k, v]) => (values[k] || '') === v);
}

function captureName(doc: string, def: ComponentDef, field: string, existing?: string): string {
  if (existing) return existing;
  const base = `${def.id.replace(/-/g, '_')}_${field}_`;
  let n = 1;
  while (doc.includes(`capture ${base}${n}`)) n++;
  return `${base}${n}`;
}

/** Build the Liquid for a component. `doc` is used to keep capture names unique. */
export function toLiquid(def: ComponentDef, values: Record<string, string>, doc = '', existing?: ComponentMatch): string {
  const params: string[] = [];
  const blocks: string[] = [];
  for (const field of def.fields) {
    const value = (values[field.name] ?? '').trim();
    if (!isVisible(field, values)) continue;
    if (field.type === 'markdown') {
      const name = captureName(doc, def, field.name, existing?.captures[field.name]);
      blocks.push(`{% capture ${name} %}\n${value}\n{% endcapture %}`);
      params.push(`${field.name}=${name}`);
      continue;
    }
    if (!value || (field.default !== undefined && value === field.default)) continue;
    params.push(`${field.name}="${escapeValue(value)}"`);
  }
  return [...blocks, `{% include ${def.include} ${params.join(' ')} %}`].join('\n');
}

export function missingRequired(def: ComponentDef, values: Record<string, string>): string[] {
  return def.fields.filter((f) => f.required && isVisible(f, values) && !(values[f.name] || '').trim()).map((f) => f.label);
}
