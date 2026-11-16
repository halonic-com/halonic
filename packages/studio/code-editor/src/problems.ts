import { type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter } from "@codemirror/view";

/** One thing wrong in the text, and where. */
export type EditorProblem = {
  readonly severity: "error" | "warning";
  readonly message: string;
  /** 1-based line and column in the text. */
  readonly line: number;
  readonly col: number;
};

/** A problem placed in the document; the positions follow the text as it is edited. */
type Placed = { readonly from: number; readonly to: number } & Pick<
  EditorProblem,
  "severity" | "message"
>;

const setProblems = StateEffect.define<readonly EditorProblem[]>();

/** The place of a problem: from its column to the end of the word, or the character before it at a line's end. */
function place(state: EditorState, problem: EditorProblem): Placed | undefined {
  const { doc } = state;
  const line = doc.line(Math.min(Math.max(problem.line, 1), doc.lines));
  const at = line.from + Math.min(Math.max(problem.col - 1, 0), line.length);
  const word = /^\S+/.exec(doc.sliceString(at, line.to))?.[0].length ?? 0;
  const { severity, message } = problem;
  if (word > 0) return { from: at, to: at + word, severity, message };
  if (at > line.from) return { from: at - 1, to: at, severity, message };
  return { from: line.from, to: line.from, severity, message };
}

const problemField = StateField.define<readonly Placed[]>({
  create: () => [],
  update(placed, transaction) {
    let next = placed;
    if (transaction.docChanged)
      next = next.map((p) => ({
        ...p,
        from: transaction.changes.mapPos(p.from, 1),
        to: transaction.changes.mapPos(p.to, -1),
      }));
    for (const effect of transaction.effects)
      if (effect.is(setProblems))
        next = effect.value
          .map((problem) => place(transaction.state, problem))
          .filter((p) => p !== undefined)
          .sort((a, b) => a.from - b.from);
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (placed) =>
      Decoration.set(
        placed
          .filter((p) => p.to > p.from)
          .map((p) =>
            Decoration.mark({
              class: `cm-problem-${p.severity}`,
              attributes: { title: p.message },
            }).range(p.from, p.to),
          ),
        true,
      ),
    ),
});

class Mark extends GutterMarker {
  readonly severity: "error" | "warning";
  constructor(severity: "error" | "warning") {
    super();
    this.severity = severity;
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof Mark && other.severity === this.severity;
  }
  override toDOM(): Node {
    // Shape and colour both say which it is; the Problems list says it in words.
    const icon = document.createElement("span");
    icon.className = `cm-problem-mark cm-problem-mark-${this.severity}`;
    icon.textContent = this.severity === "error" ? "✕" : "△";
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }
}

const errorMark = new Mark("error");
const warningMark = new Mark("warning");

/** Shows `problems` in the editor; replaces the ones shown before. */
export function showProblems(view: EditorView, problems: readonly EditorProblem[]): void {
  view.dispatch({ effects: setProblems.of(problems) });
}

/** The problem after the cursor (or before it), wrapping at the ends; the cursor goes to it. */
export function jumpToProblem(view: EditorView, direction: 1 | -1): EditorProblem | undefined {
  const placed = view.state.field(problemField);
  if (placed.length === 0) return undefined;
  const head = view.state.selection.main.head;
  const target =
    direction === 1
      ? (placed.find((p) => p.from > head) ?? placed[0])
      : (placed.findLast((p) => p.from < head) ?? placed.at(-1));
  if (target === undefined) return undefined;
  view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
  const line = view.state.doc.lineAt(target.from);
  return {
    severity: target.severity,
    message: target.message,
    line: line.number,
    col: target.from - line.from + 1,
  };
}

/** The squiggles under the problems and an icon in the gutter on their lines, errors before warnings. */
export function problemMarks(onMarkClick: (line: number) => void): Extension {
  return [
    problemField,
    gutter({
      class: "cm-problem-gutter",
      lineMarker(view, block) {
        const line = view.state.doc.lineAt(block.from);
        const here = view.state
          .field(problemField)
          .filter((p) => p.from >= line.from && p.from <= line.to);
        if (here.length === 0) return null;
        return here.some((p) => p.severity === "error") ? errorMark : warningMark;
      },
      lineMarkerChange: (update) =>
        update.docChanged ||
        update.transactions.some((t) => t.effects.some((e) => e.is(setProblems))),
      domEventHandlers: {
        click(view, block) {
          const line = view.state.doc.lineAt(block.from).number;
          const marked = view.state
            .field(problemField)
            .some((p) => view.state.doc.lineAt(p.from).number === line);
          if (marked) onMarkClick(line);
          return marked;
        },
      },
    }),
  ];
}
