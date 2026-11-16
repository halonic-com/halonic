import {
  Annotation,
  type ChangeSet,
  type Extension,
  StateEffect,
  StateField,
  type Transaction,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Typing within this many milliseconds of the last change joins the same undo step. */
export const groupWindowMs = 500;

/** One undo step: the change that reverses it, and the change that does it again. */
type Step = { readonly undo: ChangeSet; readonly redo: ChangeSet; readonly at: number };

type History = { readonly done: readonly Step[]; readonly undone: readonly Step[] };

const emptyHistory: History = { done: [], undone: [] };

/** Marks a change that undo or redo made, so the history moves a step instead of recording one. */
const moved = Annotation.define<"undo" | "redo">();

/** Empties the history, for a document that replaces the whole text. */
const forget = StateEffect.define<null>();

function recordStep(history: History, tr: Transaction, now: number): History {
  const fresh: Step = { undo: tr.changes.invert(tr.startState.doc), redo: tr.changes, at: now };
  const last = history.done[history.done.length - 1];
  if (last && now - last.at < groupWindowMs && tr.isUserEvent("input.type")) {
    // Typing joins into one step: undo the newer change first, then the older one.
    const joined: Step = {
      undo: fresh.undo.compose(last.undo),
      redo: last.redo.compose(fresh.redo),
      at: now,
    };
    return { done: [...history.done.slice(0, -1), joined], undone: [] };
  }
  return { done: [...history.done, fresh], undone: [] };
}

const historyField = StateField.define<History>({
  create: () => emptyHistory,
  update(history, tr) {
    if (tr.effects.some((e) => e.is(forget))) return emptyHistory;
    const direction = tr.annotation(moved);
    if (direction === "undo") {
      const step = history.done[history.done.length - 1];
      return step
        ? { done: history.done.slice(0, -1), undone: [...history.undone, step] }
        : history;
    }
    if (direction === "redo") {
      const step = history.undone[history.undone.length - 1];
      return step
        ? { done: [...history.done, { ...step, at: 0 }], undone: history.undone.slice(0, -1) }
        : history;
    }
    return tr.docChanged ? recordStep(history, tr, Date.now()) : history;
  },
});

/** The editor's own undo history. CodeMirror's own history is never loaded. */
export const undoHistory: Extension = historyField;

function move(view: EditorView, direction: "undo" | "redo"): boolean {
  const history = view.state.field(historyField);
  const list = direction === "undo" ? history.done : history.undone;
  const step = list[list.length - 1];
  if (!step) return false;
  view.dispatch({
    changes: direction === "undo" ? step.undo : step.redo,
    annotations: moved.of(direction),
    scrollIntoView: true,
  });
  return true;
}

export const undo = (view: EditorView): boolean => move(view, "undo");
export const redo = (view: EditorView): boolean => move(view, "redo");

/** Starts a new history; called when a different file's text is loaded. */
export const forgetHistory = (view: EditorView): void =>
  view.dispatch({ effects: forget.of(null) });

export function canUndo(view: EditorView): boolean {
  return view.state.field(historyField).done.length > 0;
}
export function canRedo(view: EditorView): boolean {
  return view.state.field(historyField).undone.length > 0;
}
