import type { WorkflowArrow } from "../api.ts";
import { type ArrowShape, arrowShape } from "../canvas/arrow-path.ts";
import type { Box } from "../canvas/geometry.ts";

/** Props for {@link Arrows}. */
export interface ArrowsProps {
  readonly arrows: readonly WorkflowArrow[];
  readonly boxes: ReadonlyMap<string, Box>;
  /** The steps a shown run went through, in order; an arrow it went along is blue. */
  readonly route?: readonly string[] | undefined;
}

/** The arrows between the step cards as one SVG layer; an arrow to a step that isn't there is left out. */
export function Arrows({ arrows, boxes, route }: ArrowsProps) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 size-px overflow-visible"
    >
      {arrows.map((arrow, index) => {
        const from = boxes.get(arrow.from);
        const to = boxes.get(arrow.to);
        if (from === undefined || to === undefined) return null;
        const shape = arrowShape(from, to);
        const taken = wentAlong(route, arrow);
        return (
          // The same two steps can have several arrows, so the position is part of the key.
          <g
            key={`${arrow.from}>${arrow.to}#${index}`}
            data-taken={taken ? "" : undefined}
            // The head uses currentColor too, so line and head change together; forced colours fall back to a system colour.
            className={taken ? "text-accent-text forced-colors:text-[Highlight]" : "text-fg-muted"}
          >
            <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={1.5} />
            <polygon
              points="-6,-4 0,0 -6,4"
              fill="currentColor"
              transform={`translate(${shape.head.x} ${shape.head.y}) rotate(${shape.headAngle})`}
            />
            {arrow.label !== undefined && <ArrowLabel shape={shape} label={arrow.label} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Rough width of one caption character and a chip's side padding, in canvas units. */
const CHAR_WIDTH = 6.5;
const CHIP_PADDING = 8;
const CHIP_HEIGHT = 18;

/** The words on an arrow, on an opaque chip beside the line so no line runs through them. */
function ArrowLabel({ shape, label }: { readonly shape: ArrowShape; readonly label: string }) {
  const width = label.length * CHAR_WIDTH + CHIP_PADDING * 2;
  const left = {
    start: shape.label.x,
    end: shape.label.x - width,
    middle: shape.label.x - width / 2,
  }[shape.labelAnchor];
  return (
    <g>
      <rect
        x={left}
        y={shape.label.y - CHIP_HEIGHT / 2}
        width={width}
        height={CHIP_HEIGHT}
        rx={CHIP_HEIGHT / 2}
        className="fill-surface stroke-border"
      />
      <text
        x={left + width / 2}
        y={shape.label.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-fg text-caption"
      >
        {label}
      </text>
    </g>
  );
}

/** Whether the run went straight from the arrow's first step to its second. */
function wentAlong(route: readonly string[] | undefined, arrow: WorkflowArrow): boolean {
  return route?.some((id, at) => id === arrow.from && route[at + 1] === arrow.to) === true;
}
