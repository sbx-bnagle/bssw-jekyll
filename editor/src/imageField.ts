import { h } from './ui';

export interface ImageContext {
  /** Stores an uploaded file with the draft; resolves to its site path (/images/...). */
  upload(file: File): Promise<string>;
  /** URL the editor can display for a site path. */
  resolve(path: string): string;
}

export function imageField(initial: string, ctx: ImageContext, onChange: (path: string) => void, id?: string): HTMLElement {
  const thumb = h('img', { class: 'thumb', alt: '', hidden: !initial });
  const show = (path: string) => { thumb.hidden = !path; if (path) thumb.src = ctx.resolve(path); };
  const input = h('input', {
    type: 'text', id, value: initial, placeholder: '/images/example.png', spellcheck: 'false',
    oninput: () => { onChange(input.value.trim()); show(input.value.trim()); }
  });
  const file = h('input', {
    type: 'file', accept: 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp', hidden: true,
    onchange: async () => {
      const f = file.files?.[0];
      if (!f) return;
      const path = await ctx.upload(f);
      input.value = path;
      onChange(path);
      show(path);
      file.value = '';
    }
  });
  show(initial);
  return h('div', { class: 'image-field' },
    thumb,
    h('div', { class: 'image-inputs' },
      input,
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => file.click() }, 'Upload…'),
      file));
}
