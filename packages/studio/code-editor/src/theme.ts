import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * The editor's look, taken only from the kit's colour variables, so light, dark
 * and high-contrast follow the rest of the Studio (kit spec 24.7).
 */
const frame = EditorView.theme({
  "&": {
    color: "var(--color-fg)",
    backgroundColor: "var(--color-surface)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-code)",
    height: "100%",
  },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "var(--text-code--line-height)" },
  ".cm-content": { caretColor: "var(--color-fg)" },
  ".cm-cursor": { borderLeftColor: "var(--color-fg)" },
  "&.cm-focused": { outline: "none", boxShadow: "var(--focus-ring-inset)" },
  ".cm-gutters": {
    color: "var(--color-fg-subtle)",
    backgroundColor: "var(--color-surface-subtle)",
    borderRight: "1px solid var(--color-border)",
  },
  ".cm-activeLine": { backgroundColor: "var(--color-surface-subtle)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-surface-muted)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--color-accent-soft)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--color-accent-soft)",
  },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--color-surface-muted)",
    outline: "1px solid var(--color-border-strong)",
  },
});

/** Three looks: keys and headings in the accent, comments quiet and italic, the rest in the text colour. */
const colours = HighlightStyle.define([
  { tag: [tags.propertyName, tags.heading, tags.strong], color: "var(--color-accent-text)" },
  { tag: [tags.comment, tags.meta], color: "var(--color-fg-subtle)", fontStyle: "italic" },
]);

export const theme: Extension = [frame, syntaxHighlighting(colours)];
