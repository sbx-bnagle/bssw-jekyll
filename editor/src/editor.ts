import { basicSetup } from 'codemirror';
import { EditorView, Decoration, MatchDecorator, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { componentAt, type ComponentMatch } from './components';

export interface EditorHandlers {
  onChange(doc: string): void;
  onCursor(pos: number): void;
  onEditComponent(match: ComponentMatch): void;
  onImage(file: File, pos: number): void;
}

// Highlight component Liquid so it reads as a unit in the Markdown.
const tagMatcher = new MatchDecorator({
  regexp: /\{%-?\s*(?:include\s+components\/[\s\S]*?|capture\s+\w+|endcapture)\s*-?%\}/g,
  decoration: Decoration.mark({ class: 'cm-component-tag', attributes: { title: 'Component: double-click to edit' } })
});
const componentHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = tagMatcher.createDeco(view); }
  update(u: ViewUpdate) { this.decorations = tagMatcher.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations });

function wrapSelection(view: EditorView, before: string, after = before, placeholder = 'text') {
  view.dispatch(view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to) || placeholder;
    return {
      changes: { from: range.from, to: range.to, insert: before + text + after },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length)
    };
  }));
  view.focus();
  return true;
}

export function createEditor(parent: HTMLElement, doc: string, handlers: EditorHandlers) {
  const view = new EditorView({
    parent,
    doc,
    extensions: [
      basicSetup,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      componentHighlight,
      keymap.of([
        { key: 'Mod-b', run: (v) => wrapSelection(v, '**') },
        { key: 'Mod-i', run: (v) => wrapSelection(v, '_') },
        { key: 'Mod-k', run: (v) => wrapSelection(v, '[', '](https://)', 'link text') }
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) handlers.onChange(u.state.doc.toString());
        if (u.docChanged || u.selectionSet) handlers.onCursor(u.state.selection.main.head);
      }),
      EditorView.domEventHandlers({
        dblclick(e, v) {
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          const match = pos === null ? undefined : componentAt(v.state.doc.toString(), pos);
          if (!match) return false;
          handlers.onEditComponent(match);
          return true;
        },
        drop(e, v) {
          const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
          if (!file) return false;
          e.preventDefault();
          handlers.onImage(file, v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.selection.main.head);
          return true;
        },
        paste(e, v) {
          const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
          if (!file) return false;
          e.preventDefault();
          handlers.onImage(file, v.state.selection.main.head);
          return true;
        }
      }),
      EditorView.contentAttributes.of({ 'aria-label': 'Post body (Markdown)' })
    ]
  });

  return {
    view,
    getDoc: () => view.state.doc.toString(),
    setDoc(text: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    /** Insert a block (component) on its own, separated by blank lines; or replace [from, to). */
    insertBlock(text: string, at?: number, replace?: { from: number; to: number }) {
      if (replace) {
        view.dispatch({ changes: { ...replace, insert: text }, selection: { anchor: replace.from + text.length } });
        view.focus();
        return;
      }
      const d = view.state.doc;
      const line = d.lineAt(at ?? view.state.selection.main.head);
      const empty = line.text.trim() === '';
      const from = empty ? line.from : line.to;
      const prevBlank = line.number === 1 || (empty ? d.line(line.number - 1).text.trim() === '' : false);
      const prefix = from === 0 ? '' : empty ? (prevBlank ? '' : '\n') : '\n\n';
      const nextLine = line.number < d.lines ? d.line(line.number + 1) : null;
      const suffix = nextLine && nextLine.text.trim() !== '' ? '\n\n' : '\n';
      const insert = prefix + text + suffix;
      view.dispatch({ changes: { from, to: empty ? line.to : from, insert }, selection: { anchor: from + prefix.length + text.length + 1 }, scrollIntoView: true });
      view.focus();
    },
    wrap: (before: string, after?: string, placeholder?: string) => wrapSelection(view, before, after, placeholder),
    focus: () => view.focus()
  };
}

export type Editor = ReturnType<typeof createEditor>;
