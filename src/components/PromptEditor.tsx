// The text field of a prepared prompt. Plain Markdown, no toolbar and no typing aids (user, 2026-11-22):
// Enter is a new line and no key sends anything. One thing a plain text field cannot do is done for
// the eye only: a list item that wraps continues under its text, not under its bullet (hanging indent),
// and headings stand out. The text itself stays exactly as typed.
//
// CodeMirror, not a textarea: a textarea wraps all lines alike, a hanging indent needs each line as
// an element of its own. CodeMirror gives that with undo, input methods and paste that just work.

import { useEffect, useRef } from "react";
import { Annotation, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, insertNewline } from "@codemirror/commands";

/** Leading blanks, then a list marker (`-`, `*`, `+`, `1.`, `1)`, a task box) and the blanks after it. */
const PREFIX = /^[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?/;
const HEADING = /^#{1,6}[ \t]/;

/** Marks a change that came from disk, not from typing: it is not saved back. */
const fromDisk = Annotation.define<boolean>();

const headingLine = Decoration.line({ class: "cm-md-heading" });

/**
 * How wide a prefix is drawn in the editor's font: measured, so it also holds for a proportional font.
 * The font is read from the page once and again only when the editor's measured character width changes
 * (a font that arrives late, another size): reading styles on every keystroke made typing lag.
 */
class Ruler {
  private cache = new Map<string, number>();
  private font = "";
  private seen = -1;
  private ctx = document.createElement("canvas").getContext("2d");
  width(view: EditorView, prefix: string): number {
    const unit = view.defaultCharacterWidth;
    if (unit !== this.seen) {
      this.seen = unit;
      this.cache.clear();
      const style = getComputedStyle(view.contentDOM);
      this.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    }
    const known = this.cache.get(prefix);
    if (known !== undefined) return known;
    let width = prefix.length * unit;
    if (this.ctx) {
      this.ctx.font = this.font;
      width = this.ctx.measureText(prefix.replace(/\t/g, " ".repeat(view.state.tabSize))).width;
    }
    this.cache.set(prefix, width);
    return width;
  }
}

/** Hanging indent and headings, for the lines in view. */
const markdownLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    ruler = new Ruler();
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.geometryChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
          const line = view.state.doc.lineAt(pos);
          if (HEADING.test(line.text)) {
            builder.add(line.from, line.from, headingLine);
          } else {
            const prefix = PREFIX.exec(line.text)?.[0] ?? "";
            // A line of blanks only has nothing to hang under
            if (prefix && prefix.length < line.text.length) {
              const w = this.ruler.width(view, prefix);
              builder.add(line.from, line.from, Decoration.line({ attributes: { style: `padding-left:${w}px;text-indent:-${w}px` } }));
            }
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  },
  { decorations: (p) => p.decorations },
);

const look = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", color: "var(--color-slate-200)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.5" },
  ".cm-content": { padding: "6px 8px", caretColor: "var(--color-slate-100)" },
  ".cm-line": { padding: "0" },
  ".cm-md-heading": { fontWeight: "600", color: "var(--color-slate-100)" },
  ".cm-placeholder": { color: "var(--color-slate-500)" },
});

/**
 * The editor. `text` is read when it mounts and whenever it differs from what the editor last
 * reported (a change on disk); `onChange` gets every edit.
 */
export function PromptEditor({ text, onChange, placeholderText, autoFocus }: { text: string; onChange: (text: string) => void; placeholderText: string; autoFocus?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          history(),
          // Enter: a plain new line, nothing carried over (no typing aids)
          keymap.of([{ key: "Enter", run: insertNewline }, ...historyKeymap, ...defaultKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ spellcheck: "true", "aria-label": placeholderText }),
          placeholder(placeholderText),
          markdownLines,
          look,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(fromDisk))) changed.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // Made once; later text comes in below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change on disk while open: taken over, the cursor kept where it can be
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === text) return;
    const head = Math.min(v.state.selection.main.head, text.length);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: head }, annotations: fromDisk.of(true) });
  }, [text]);

  return <div ref={host} className="min-h-0 flex-1 overflow-hidden" />;
}
