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
  // As the kit's focus-ring-inset: high contrast drops the shadow, so the outline shows there.
  "&.cm-focused": {
    outline: "2px solid transparent",
    outlineOffset: "-2px",
    boxShadow: "var(--focus-ring-inset)",
  },
  // A theme can't put "&" inside an @media block, so in high contrast the scroller, which fills
  // the editor and holds the focused content, draws the Highlight ring over that outline.
  "@media (forced-colors: active)": {
    ".cm-scroller:focus-within": { outline: "2px solid Highlight", outlineOffset: "-2px" },
  },
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
  ".cm-problem-error": {
    textDecoration: "underline wavy var(--color-danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-problem-warning": {
    textDecoration: "underline wavy var(--color-warning)",
    textUnderlineOffset: "3px",
  },
  ".cm-problem-gutter": { width: "20px" },
  ".cm-problem-gutter .cm-gutterElement": { cursor: "pointer", textAlign: "center" },
  ".cm-problem-mark": {
    display: "inline-block",
    width: "12px",
    height: "12px",
    lineHeight: "12px",
    fontSize: "9px",
    borderRadius: "50%",
    border: "1px solid currentColor",
  },
  ".cm-problem-mark-error": { color: "var(--color-danger)" },
  ".cm-problem-mark-warning": { color: "var(--color-warning)", borderColor: "transparent" },
  // The assistant's changes to review (AI changes 1.2): green and red lines in place. The 2px
  // start edge, as ChangeMark's, tells them apart without colour and stays under forced colours;
  // the line's start padding gives up those 2px so its text doesn't move.
  ".cm-line.cm-review-added": {
    backgroundColor: "var(--color-success-soft)",
    borderInlineStart: "2px solid var(--color-success)",
    paddingInlineStart: "4px",
  },
  ".cm-review-part": { padding: "2px 0" },
  // Previous and Next move the focus to the part: it wears the ring as its buttons do.
  ".cm-review-part:focus-visible": {
    outline: "2px solid transparent",
    boxShadow: "var(--focus-ring)",
  },
  ".cm-review-removed": {
    display: "block",
    whiteSpace: "pre",
    color: "var(--color-danger)",
    backgroundColor: "var(--color-danger-soft)",
    borderInlineStart: "2px solid var(--color-danger)",
    paddingInlineStart: "4px",
  },
  ".cm-review-buttons": {
    display: "flex",
    gap: "8px",
    padding: "4px 0",
    fontFamily: "var(--font-sans)",
  },
  // Drawn as the kit's secondary sm Button, with its hover and focus ring.
  ".cm-review-button": {
    minHeight: "var(--spacing-control-sm)",
    padding: "0 10px",
    fontSize: "var(--text-body-strong)",
    fontWeight: "var(--text-body-strong--font-weight)",
    lineHeight: "var(--text-body-strong--line-height)",
    color: "var(--color-fg)",
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border-strong)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  ".cm-review-button:hover": { backgroundColor: "var(--color-surface-subtle)" },
  // As the editor's own focus rule: high contrast drops the shadow, so the outline shows there.
  ".cm-review-button:focus-visible": {
    outline: "2px solid transparent",
    boxShadow: "var(--focus-ring)",
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
