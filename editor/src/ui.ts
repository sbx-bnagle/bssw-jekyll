type Child = Node | string | null | undefined | false;

/** Tiny DOM builder. Props starting with "on" become listeners; value/checked/disabled are properties. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export interface ModalAction { label: string; primary?: boolean; danger?: boolean; onClick: () => void | boolean | Promise<void | boolean> }

/** Accessible modal dialog. An action returning false keeps it open. */
export function modal(title: string, body: Node, actions: ModalAction[], opts: { wide?: boolean; onClose?: () => void } = {}): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const close = () => { overlay.remove(); previous?.focus(); opts.onClose?.(); };
  const titleId = `m${Math.random().toString(36).slice(2)}`;
  const dialog = h('div', { class: `modal${opts.wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('header', { class: 'modal-head' },
      h('h2', { id: titleId }, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '×')),
    h('div', { class: 'modal-body' }, body),
    h('footer', { class: 'modal-foot' },
      ...actions.map((a) => h('button', {
        class: `btn${a.primary ? ' btn-primary' : ''}${a.danger ? ' btn-danger' : ''}`,
        onclick: async () => { if ((await a.onClick()) !== false) close(); }
      }, a.label))));
  const overlay = h('div', { class: 'overlay', onmousedown: (e: MouseEvent) => { if (e.target === overlay) close(); } }, dialog);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  document.body.append(overlay);
  (dialog.querySelector('input, textarea, select, button.btn-primary') as HTMLElement | null)?.focus();
  return close;
}

let toastTimer: number | undefined;
export function toast(message: string, kind: 'info' | 'ok' | 'error' = 'info', ms = 4000) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.className = `toast toast-${kind} show`;
  el.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), ms);
}

export function field(label: string, control: HTMLElement, help?: string, required?: boolean): HTMLElement {
  // Label the first form control (composite fields like the image picker wrap one).
  const target = (control.matches('input, select, textarea') ? control : control.querySelector('input:not([type=file]), select, textarea')) as HTMLElement | null ?? control;
  const id = target.id || (target.id = `f${Math.random().toString(36).slice(2)}`);
  return h('div', { class: 'field' },
    h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    help ? h('p', { class: 'help' }, help) : null);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
