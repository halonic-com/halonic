import { defaultKeymap, indentLess, indentMore } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { bracketMatching, indentUnit } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  type KeyBinding,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import type { EditorLanguage } from "./language.ts";
import { type EditorProblem, jumpToProblem, problemMarks, showProblems } from "./problems.ts";
import { theme } from "./theme.ts";
import { canRedo, canUndo, forgetHistoryEffect, redo, undo, undoHistory } from "./undo-history.ts";

export type CodeEditorOptions = {
  /** Where the editor is drawn. */
  readonly parent: HTMLElement;
  readonly text: string;
  readonly language: EditorLanguage;
  /** The name a screen reader hears for the text area, for example "models.yaml". */
  readonly label: string;
  readonly readOnly?: boolean;
  /** Called with the whole text after every change the user makes. */
  readonly onChange?: (text: string) => void;
  /** Called when Tab starts or stops moving focus (Ctrl M, or Esc then Tab). */
  readonly onTabFocusChange?: (tabMovesFocus: boolean) => void;
  /** Called with the problem F8 or Shift F8 moved the cursor to, so its owner can read it out. */
  readonly onProblemJump?: (problem: EditorProblem) => void;
  /** Called with the line when the user clicks a problem's icon in the gutter. */
  readonly onProblemMarkClick?: (line: number) => void;
};

export type CodeEditor = {
  readonly text: () => string;
  /** Replaces the whole text, for example after the file changed on disk. The undo history starts again. */
  readonly load: (text: string, language?: EditorLanguage) => void;
  readonly setReadOnly: (readOnly: boolean) => void;
  /** Underlines the problems and marks their lines in the gutter, in place of the ones shown before. */
  readonly setProblems: (problems: readonly EditorProblem[]) => void;
  /** Puts the cursor at a 1-based line and column (kept inside the text), scrolls to it and focuses the editor. */
  readonly goTo: (line: number, col?: number) => void;
  readonly focus: () => void;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly tabMovesFocus: () => boolean;
  readonly destroy: () => void;
};

const indentSize = 2;

/** Marks the change `load` makes, which is not an edit by the user, so `onChange` is not called. */
const loaded = Annotation.define<true>();

function languageExtension(language: EditorLanguage): Extension {
  if (language === "yaml") return yaml();
  if (language === "markdown") return markdown();
  return [];
}

/** Tab with no selection inserts spaces up to the next stop (YAML never takes tab characters); with one it indents the lines. */
function tabIndent(view: EditorView): boolean {
  if (view.state.readOnly) return true;
  if (view.state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  view.dispatch(
    view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.head);
      const spaces = " ".repeat(indentSize - ((range.head - line.from) % indentSize));
      return {
        changes: { from: range.head, insert: spaces },
        range: EditorSelection.cursor(range.head + spaces.length),
      };
    }),
    { userEvent: "input" },
  );
  return true;
}

export function createCodeEditor(options: CodeEditorOptions): CodeEditor {
  const languageSlot = new Compartment();
  const readOnlySlot = new Compartment();
  let tabMovesFocus = false;
  let escaped = false;

  const setTabMovesFocus = (on: boolean) => {
    if (tabMovesFocus === on) return;
    tabMovesFocus = on;
    options.onTabFocusChange?.(on);
  };

  /** F8 and Shift F8: the next and previous problem, wrapping. */
  const jump = (view: EditorView, direction: 1 | -1): boolean => {
    const problem = jumpToProblem(view, direction);
    if (problem !== undefined) options.onProblemJump?.(problem);
    return true;
  };

  const keys: KeyBinding[] = [
    {
      key: "Tab",
      run: (view) => {
        // Esc then Tab, or Ctrl M, lets Tab leave the editor so a keyboard user is never trapped.
        if (tabMovesFocus || escaped) {
          escaped = false;
          return false;
        }
        return tabIndent(view);
      },
      shift: (view) => (tabMovesFocus || escaped ? false : indentLess(view)),
    },
    {
      key: "Escape",
      run: () => {
        escaped = true;
        return true;
      },
    },
    {
      key: "Ctrl-m",
      mac: "Shift-Alt-m",
      run: () => {
        setTabMovesFocus(!tabMovesFocus);
        return true;
      },
    },
    { key: "F8", run: (view) => jump(view, 1), shift: (view) => jump(view, -1) },
    { key: "Mod-z", run: undo, preventDefault: true },
    { key: "Mod-Shift-z", run: redo, preventDefault: true },
    { key: "Mod-y", run: redo, preventDefault: true },
  ];

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        undoHistory,
        keymap.of([...keys, ...defaultKeymap]),
        lineNumbers(),
        problemMarks((line) => options.onProblemMarkClick?.(line)),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        bracketMatching(),
        indentUnit.of(" ".repeat(indentSize)),
        EditorState.tabSize.of(indentSize),
        EditorView.contentAttributes.of({ "aria-label": options.label }),
        languageSlot.of(languageExtension(options.language)),
        readOnlySlot.of(EditorState.readOnly.of(options.readOnly ?? false)),
        theme,
        EditorView.updateListener.of((update) => {
          // Any edit or cursor move after Esc means the user is writing again, so Tab indents.
          if (update.docChanged || update.selectionSet) escaped = false;
          if (update.docChanged && !update.transactions.some((t) => t.annotation(loaded)))
            options.onChange?.(update.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    text: () => view.state.doc.toString(),
    load: (text, language) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        effects: [
          forgetHistoryEffect,
          ...(language ? [languageSlot.reconfigure(languageExtension(language))] : []),
        ],
        annotations: loaded.of(true),
      });
    },
    setReadOnly: (readOnly) =>
      view.dispatch({ effects: readOnlySlot.reconfigure(EditorState.readOnly.of(readOnly)) }),
    setProblems: (problems) => showProblems(view, problems),
    goTo: (line, col = 1) => {
      const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
      const at = target.from + Math.min(Math.max(col - 1, 0), target.length);
      view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
      view.focus();
    },
    focus: () => view.focus(),
    undo: () => undo(view),
    redo: () => redo(view),
    canUndo: () => canUndo(view),
    canRedo: () => canRedo(view),
    tabMovesFocus: () => tabMovesFocus,
    destroy: () => view.destroy(),
  };
}
