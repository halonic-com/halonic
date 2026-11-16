import {
  type EditorState,
  type Extension,
  type RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutter } from "@codemirror/view";

/** One thing wrong in the text, and where: 1-based line and column. */
export type EditorProblem = {
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly line: number;
  readonly col: number;
};

const setProblemsEffect = StateEffect.define<readonly EditorProblem[]>();

/** The gutter's ✕ or △, so an error and a warning never differ by colour alone. */
class ProblemMarker extends GutterMarker {
  readonly severity: EditorProblem["severity"];

  constructor(severity: EditorProblem["severity"]) {
    super();
    this.severity = severity;
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof ProblemMarker && other.severity === this.severity;
  }

  override toDOM(): Node {
    const icon = document.createElement("span");
    icon.className = `cm-problem-icon cm-problem-${this.severity}`;
    icon.textContent = this.severity === "error" ? "✕" : "△";
    // The Problems list names every problem; the icon only points at it.
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }
}

const errorMarker = new ProblemMarker("error");
const warningMarker = new ProblemMarker("warning");

type Marks = {
  readonly squiggles: DecorationSet;
  readonly gutter: RangeSet<GutterMarker>;
};

/** The range a problem underlines: from its column to the end of the word there, at least one character. */
function squiggleRange(doc: Text, problem: EditorProblem): { from: number; to: number } | null {
  if (problem.line < 1 || problem.line > doc.lines) return null;
  const line = doc.line(problem.line);
  if (line.length === 0) return null;
  const from = line.from + Math.min(Math.max(problem.col - 1, 0), line.length - 1);
  const rest = doc.sliceString(from, line.to);
  const word = /^[^\s,:]+/.exec(rest);
  return { from, to: from + (word?.[0].length ?? 1) };
}

function marksOf(state: EditorState, problems: readonly EditorProblem[]): Marks {
  const doc = state.doc;
  const squiggles: { from: number; to: number; severity: EditorProblem["severity"] }[] = [];
  const worst = new Map<number, EditorProblem["severity"]>();
  for (const problem of problems) {
    const range = squiggleRange(doc, problem);
    if (range === null) continue;
    squiggles.push({ ...range, severity: problem.severity });
    const at = doc.lineAt(range.from).from;
    if (worst.get(at) !== "error") worst.set(at, problem.severity);
  }
  squiggles.sort((a, b) => a.from - b.from || a.to - b.to);
  const squiggleBuilder = new RangeSetBuilder<Decoration>();
  for (const { from, to, severity } of squiggles) {
    squiggleBuilder.add(
      from,
      to,
      Decoration.mark({ class: `cm-squiggle cm-squiggle-${severity}` }),
    );
  }
  const gutterBuilder = new RangeSetBuilder<GutterMarker>();
  for (const at of [...worst.keys()].sort((a, b) => a - b)) {
    gutterBuilder.add(at, at, worst.get(at) === "error" ? errorMarker : warningMarker);
  }
  return { squiggles: squiggleBuilder.finish(), gutter: gutterBuilder.finish() };
}

const problemField = StateField.define<{ problems: readonly EditorProblem[]; marks: Marks }>({
  create: (state) => ({ problems: [], marks: marksOf(state, []) }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setProblemsEffect)) {
        return { problems: effect.value, marks: marksOf(transaction.state, effect.value) };
      }
    }
    // The marks follow the text until the next check says where the problems are now.
    if (transaction.docChanged) {
      return { problems: value.problems, marks: marksOf(transaction.state, value.problems) };
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.marks.squiggles),
});

const look = EditorView.theme({
  ".cm-squiggle": { textDecorationLine: "underline", textDecorationStyle: "wavy" },
  ".cm-squiggle-error": { textDecorationColor: "var(--color-danger)" },
  ".cm-squiggle-warning": { textDecorationColor: "var(--color-warning)" },
  ".cm-problem-gutter": { width: "20px" },
  ".cm-problem-gutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  ".cm-problem-icon": { fontSize: "12px", lineHeight: "1" },
  ".cm-problem-error": { color: "var(--color-danger)" },
  ".cm-problem-warning": { color: "var(--color-warning)" },
});

/** Sets the problems the editor underlines and marks in its gutter. */
export function setProblemsOf(view: EditorView, problems: readonly EditorProblem[]): void {
  view.dispatch({ effects: setProblemsEffect.of(problems) });
}

/** Puts the cursor where a problem is and scrolls it into view; a line past the end goes to the last line. */
export function goToPosition(view: EditorView, line: number, col: number): void {
  const doc = view.state.doc;
  const at = doc.line(Math.min(Math.max(line, 1), doc.lines));
  const anchor = at.from + Math.min(Math.max(col - 1, 0), at.length);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
  });
}

/** Squiggles under problems, and the gutter's ✕ and △; a click on one tells `onGutterClick` its line. */
export function problemMarks(onGutterClick: (line: number) => void): Extension {
  return [
    problemField,
    gutter({
      class: "cm-problem-gutter",
      markers: (view) => view.state.field(problemField).marks.gutter,
      domEventHandlers: {
        mousedown: (view, block) => {
          const line = view.state.doc.lineAt(block.from).number;
          if (!view.state.field(problemField).problems.some((problem) => problem.line === line)) {
            return false;
          }
          onGutterClick(line);
          return true;
        },
      },
    }),
    look,
  ];
}
