import type { WorkflowArrow, WorkflowProblem } from "../api.ts";
import { type ArrowShape, arrowShape, strayShape } from "../canvas/arrow-path.ts";
import type { Box } from "../canvas/geometry.ts";
import { arrowProblems, type ProblemMark, type StepNames } from "../configuration/problem-lines.ts";

/** Props for {@link Arrows}. */
export interface ArrowsProps {
  readonly arrows: readonly WorkflowArrow[];
  readonly boxes: ReadonlyMap<string, Box>;
  /** The steps a shown run went through, in order; an arrow it went along is blue. */
  readonly route?: readonly string[] | undefined;
  /** What the checks found in the workflow: an arrow's problem marks its label plate (flow-workflows 4.4). */
  readonly problems?: readonly WorkflowProblem[] | undefined;
  /** How a plate's tooltip names a step: as its card does. */
  readonly stepName?: StepNames | undefined;
}

/** One arrow as the layer draws it. */
interface PlacedArrow {
  readonly key: string;
  readonly arrow: WorkflowArrow;
  readonly shape: ArrowShape;
  /** What its plate shows of the arrow's problems; absent when it has none. */
  readonly mark: ProblemMark | undefined;
  /** It goes to a step that isn't there, so it is a short stray arrow out of its card. */
  readonly stray: boolean;
}

/**
 * The arrows between the step cards as one SVG layer. An arrow to a step that isn't there is a
 * short stray arrow ending in its problem's plate, or left out while the checks haven't said why.
 */
export function Arrows({ arrows, boxes, route, problems = [], stepName }: ArrowsProps) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 size-px overflow-visible"
    >
      {placeArrows(arrows, boxes, problems, stepName).map(({ key, arrow, shape, mark, stray }) => {
        const taken = wentAlong(route, arrow);
        return (
          <g
            key={key}
            data-taken={taken ? "" : undefined}
            // The head uses currentColor too, so line and head change together; forced colours fall back to a system colour.
            className={lineColour(taken, stray ? mark : undefined)}
          >
            <path
              d={shape.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray={stray ? "4 3" : undefined}
            />
            <polygon
              points="-6,-4 0,0 -6,4"
              fill="currentColor"
              transform={`translate(${shape.head.x} ${shape.head.y}) rotate(${shape.headAngle})`}
            />
            {(arrow.label !== undefined || mark !== undefined) && (
              <ArrowLabel shape={shape} label={arrow.label} mark={mark} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Where each arrow goes and what its plate shows. A problem names its arrow by its place among its
 * step's arrows, so the arrows are counted step by step in the order `arrows` lists them.
 */
function placeArrows(
  arrows: readonly WorkflowArrow[],
  boxes: ReadonlyMap<string, Box>,
  problems: readonly WorkflowProblem[],
  stepName: StepNames | undefined,
): readonly PlacedArrow[] {
  const arrowsSoFar = new Map<string, number>();
  const straysSoFar = new Map<string, number>();
  return arrows.flatMap((arrow, index): PlacedArrow[] => {
    const arrowIndex = arrowsSoFar.get(arrow.from) ?? 0;
    arrowsSoFar.set(arrow.from, arrowIndex + 1);
    const from = boxes.get(arrow.from);
    if (from === undefined) return [];
    const mark = arrowProblems(problems, arrow, arrowIndex, stepName);
    // The same two steps can have several arrows, so the position is part of the key.
    const key = `${arrow.from}>${arrow.to}#${index}`;
    const to = boxes.get(arrow.to);
    if (to !== undefined) {
      return [{ key, arrow, shape: arrowShape(from, to), mark, stray: false }];
    }
    if (mark === undefined) return [];
    const order = straysSoFar.get(arrow.from) ?? 0;
    straysSoFar.set(arrow.from, order + 1);
    return [{ key, arrow, shape: strayShape(from, order), mark, stray: true }];
  });
}

/** Blue for an arrow the run went along; a stray arrow in its problem's colour; else neutral. */
function lineColour(taken: boolean, strayMark: ProblemMark | undefined): string {
  if (taken) return "text-accent-text forced-colors:text-[Highlight]";
  if (strayMark !== undefined) return toneOf[strayMark.severity].line;
  return "text-fg-muted";
}

/** The classes of a problem's colour: a stray arrow's line, and a plate's fill, edge and line. */
const toneOf = {
  error: { line: "text-danger", plate: "fill-danger-soft stroke-danger", text: "fill-danger" },
  warning: {
    line: "text-attention",
    plate: "fill-attention-soft stroke-attention",
    text: "fill-attention",
  },
} as const satisfies Record<ProblemMark["severity"], Record<string, string>>;

/** Rough width of one caption character and a chip's side padding, in canvas units. */
const CHAR_WIDTH = 6.5;
const CHIP_PADDING = 8;
const CHIP_HEIGHT = 18;
/** What stands between an arrow's words and its problem line on one plate. */
const LABEL_AND_PROBLEM = " · ";

/**
 * The words on an arrow, on an opaque chip beside the line so no line runs through them. An arrow
 * with a problem has its plate in the problem's colour, its line ("△ Never taken") after the
 * arrow's words, and each problem's full message as its tooltip (flow-workflows 4.4).
 */
function ArrowLabel({
  shape,
  label,
  mark,
}: {
  readonly shape: ArrowShape;
  readonly label: string | undefined;
  readonly mark: ProblemMark | undefined;
}) {
  const problemLine = mark === undefined ? undefined : `${mark.glyph} ${mark.line}`;
  const words = [label, problemLine].filter((part) => part !== undefined).join(LABEL_AND_PROBLEM);
  const width = words.length * CHAR_WIDTH + CHIP_PADDING * 2;
  const left = {
    start: shape.label.x,
    end: shape.label.x - width,
    middle: shape.label.x - width / 2,
  }[shape.labelAnchor];
  const chip = {
    x: left,
    y: shape.label.y - CHIP_HEIGHT / 2,
    width,
    height: CHIP_HEIGHT,
    rx: CHIP_HEIGHT / 2,
  };
  return (
    // The layer lets the pointer through to the canvas; a plate with a problem takes it, for its tooltip.
    <g data-plate="" className={mark === undefined ? undefined : "pointer-events-auto"}>
      {mark !== undefined && <title>{mark.detail}</title>}
      {/* The problem's soft fill lets light through, so the surface lies under it to keep the plate opaque. */}
      <rect {...chip} className="fill-surface stroke-border" />
      {mark !== undefined && <rect {...chip} className={toneOf[mark.severity].plate} />}
      <text
        x={left + width / 2}
        y={shape.label.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-fg text-caption"
      >
        {label}
        {label !== undefined && mark !== undefined && LABEL_AND_PROBLEM}
        {mark !== undefined && <tspan className={toneOf[mark.severity].text}>{problemLine}</tspan>}
      </text>
    </g>
  );
}

/** Whether the run went straight from the arrow's first step to its second. */
function wentAlong(route: readonly string[] | undefined, arrow: WorkflowArrow): boolean {
  return route?.some((id, at) => id === arrow.from && route[at + 1] === arrow.to) === true;
}
