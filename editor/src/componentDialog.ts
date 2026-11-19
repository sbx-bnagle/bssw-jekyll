import type { ComponentDef, ComponentField } from './data';
import { defaults, isVisible, missingRequired } from './components';
import { imageField, type ImageContext } from './imageField';
import { field, h, modal, toast } from './ui';

function control(f: ComponentField, values: Record<string, string>, ctx: ImageContext, changed: () => void): HTMLElement {
  const id = `c-${f.name}`;
  const set = (v: string) => { values[f.name] = v; changed(); };
  switch (f.type) {
    case 'image':
      return imageField(values[f.name] || '', ctx, set, id);
    case 'textarea':
    case 'markdown':
      return h('textarea', { id, rows: f.type === 'markdown' ? 8 : 3, class: f.type === 'markdown' ? 'mono' : '', value: values[f.name] || '', oninput: (e: Event) => set((e.target as HTMLTextAreaElement).value) });
    case 'select':
      return h('select', { id, onchange: (e: Event) => set((e.target as HTMLSelectElement).value) },
        ...(f.options || []).map((o) => h('option', { value: o.value, selected: (values[f.name] || f.default) === o.value }, o.label)));
    case 'checkbox':
      return h('input', { id, type: 'checkbox', checked: (values[f.name] || f.default) === 'true', onchange: (e: Event) => set((e.target as HTMLInputElement).checked ? 'true' : 'false') });
    default:
      return h('input', { id, type: f.type === 'url' ? 'url' : 'text', value: values[f.name] || '', oninput: (e: Event) => set((e.target as HTMLInputElement).value) });
  }
}

/** Form for a component's fields. Resolves with the values, or null if cancelled. */
export function componentDialog(def: ComponentDef, initial: Record<string, string>, ctx: ImageContext, editing: boolean): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const values = { ...defaults(def), ...initial };
    const rows = new Map<ComponentField, HTMLElement>();
    const refresh = () => rows.forEach((row, f) => { row.hidden = !isVisible(f, values); });
    const form = h('form', { class: 'component-form', onsubmit: (e: Event) => e.preventDefault() },
      h('p', { class: 'muted' }, def.description),
      ...def.fields.map((f) => {
        const c = control(f, values, ctx, refresh);
        const row = f.type === 'checkbox'
          ? h('div', { class: 'field field-check' }, c, h('label', { for: c.id || `c-${f.name}` }, f.label))
          : field(f.label, c, f.help, f.required);
        rows.set(f, row);
        return row;
      }));
    refresh();
    let done = false;
    const finish = (v: Record<string, string> | null) => { if (!done) { done = true; resolve(v); } };
    modal(`${editing ? 'Edit' : 'Insert'} ${def.label.toLowerCase()}`, form, [
      { label: 'Cancel', onClick: () => finish(null) },
      {
        label: editing ? 'Update' : 'Insert', primary: true,
        onClick: () => {
          const missing = missingRequired(def, values);
          if (missing.length) { toast(`Fill in: ${missing.join(', ')}`, 'error'); return false; }
          finish(values);
        }
      }
    ], { onClose: () => finish(null) }); // ×, Escape and backdrop count as cancel
  });
}
