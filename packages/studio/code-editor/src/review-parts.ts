import {
  type EditorState,
  type Extension,
  Facet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

/** One part of the assistant's changes to review (a group of lines), where it is in the text now. */
export type EditorReviewPart = {
  /** The 1-based line where the part's added lines start, or where its removed lines were. */
  readonly line: number;
  /** How many lines the assistant added there; 0 when it only removed lines. */
  readonly added: number;
  /** The lines the assistant removed there, each without its newline. */
  readonly removed: readonly string[];
  /** The only part of a file the assistant created: rejecting it deletes the file. */
  readonly deletesFile?: boolean;
};

/** What a part's Accept and Reject say and do; the owner gives the words. */
export type EditorReviewActions = {
  readonly accept: string;
  readonly reject: string;
  /** Reject on a part that deletes the file: "Reject and delete file". */
  readonly rejectAndDelete: string;
  /** The name a screen reader hears for part `at` of `count`, both from 1: "Change 1 of 3". */
  readonly partLabel: (at: number, count: number) => string;
  /** Called with the part's index in the list last set, and the decision. */
  readonly onDecide: (part: number, decision: "accept" | "reject") => void;
};

/** A part placed in the document; the positions follow the text as it is edited. */
type Placed = {
  readonly index: number;
  /** The start of the part's first line. */
  readonly from: number;
  /** The end of its last added line; `from` when it added none. */
  readonly to: number;
  readonly added: boolean;
  readonly removed: readonly string[];
  readonly deletesFile: boolean;
};

const setParts = StateEffect.define<readonly EditorReviewPart[]>();

function place(state: EditorState, part: EditorReviewPart, index: number): Placed {
  const { doc } = state;
  const removed = part.removed;
  const deletesFile = part.deletesFile === true;
  // A part that only removed the last lines sits after the end of the text.
  if (part.line > doc.lines)
    return { index, from: doc.length, to: doc.length, added: false, removed, deletesFile };
  const first = doc.line(Math.max(part.line, 1));
  if (part.added === 0)
    return { index, from: first.from, to: first.from, added: false, removed, deletesFile };
  const last = doc.line(Math.min(part.line + part.added - 1, doc.lines));
  return { index, from: first.from, to: last.to, added: true, removed, deletesFile };
}

/** The removed lines struck through, then Accept and Reject, above the part's added lines. */
class PartWidget extends WidgetType {
  readonly part: Placed;
  readonly count: number;
  readonly actions: EditorReviewActions;

  constructor(part: Placed, count: number, actions: EditorReviewActions) {
    super();
    this.part = part;
    this.count = count;
    this.actions = actions;
  }

  override eq(other: PartWidget): boolean {
    return (
      other.part.index === this.part.index &&
      other.count === this.count &&
      other.part.deletesFile === this.part.deletesFile &&
      other.part.removed.join("\n") === this.part.removed.join("\n")
    );
  }

  override toDOM(): HTMLElement {
    const { part, count, actions } = this;
    const group = document.createElement("div");
    group.className = "cm-review-part";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", actions.partLabel(part.index + 1, count));
    group.dataset["reviewPart"] = String(part.index);
    for (const line of part.removed) {
      const removed = document.createElement("del");
      removed.className = "cm-review-removed";
      removed.textContent = line === "" ? " " : line;
      group.append(removed);
    }
    const buttons = document.createElement("div");
    buttons.className = "cm-review-buttons";
    buttons.append(
      this.#button(actions.accept, "accept"),
      this.#button(part.deletesFile ? actions.rejectAndDelete : actions.reject, "reject"),
    );
    group.append(buttons);
    return group;
  }

  #button(label: string, decision: "accept" | "reject"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-review-button";
    button.textContent = label;
    button.addEventListener("click", () => this.actions.onDecide(this.part.index, decision));
    return button;
  }
}

/** The parts' widgets and the green mark on every added line, not only the first. */
function decorationsOf(state: EditorState): DecorationSet {
  const placed = state.field(partsField);
  const actions = state.facet(reviewActions);
  const ranges = [];
  for (const part of placed) {
    if (actions !== undefined) {
      const atEnd = !part.added && part.from === state.doc.length && part.from > 0;
      ranges.push(
        Decoration.widget({
          widget: new PartWidget(part, placed.length, actions),
          block: true,
          side: atEnd ? 1 : -1,
        }).range(part.from),
      );
    }
    if (!part.added) continue;
    for (let at = part.from; at <= part.to; ) {
      const line = state.doc.lineAt(at);
      ranges.push(Decoration.line({ class: "cm-review-added" }).range(line.from));
      at = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

/** The owner's words and handler for the parts' Accept and Reject. */
const reviewActions = Facet.define<EditorReviewActions, EditorReviewActions | undefined>({
  combine: (values) => values[0],
});

const partsField = StateField.define<readonly Placed[]>({
  create: () => [],
  update(placed, transaction) {
    let next = placed;
    if (transaction.docChanged)
      next = next.map((p) => ({
        ...p,
        from: transaction.changes.mapPos(p.from, -1),
        to: transaction.changes.mapPos(p.to, 1),
      }));
    for (const effect of transaction.effects)
      if (effect.is(setParts))
        next = effect.value.map((part, index) => place(transaction.state, part, index));
    return next;
  },
});

/**
 * The assistant's changes to review in place (AI changes 1.2): added lines on a green background,
 * removed lines struck through in red above where they were, and each part's own Accept and
 * Reject.
 */
export function reviewParts(actions: EditorReviewActions): Extension {
  return [
    reviewActions.of(actions),
    partsField,
    EditorView.decorations.compute([partsField, reviewActions], decorationsOf),
  ];
}

/** Shows `parts` in the editor, in place of the ones shown before. */
export function showReviewParts(view: EditorView, parts: readonly EditorReviewPart[]): void {
  view.dispatch({ effects: setParts.of(parts) });
}

/** Puts the cursor on the first line of part `index`, scrolls to it and focuses the editor. */
export function goToReviewPart(view: EditorView, index: number): void {
  const part = view.state.field(partsField, false)?.[index];
  if (part === undefined) return;
  view.dispatch({ selection: { anchor: part.from }, scrollIntoView: true });
  view.focus();
}
