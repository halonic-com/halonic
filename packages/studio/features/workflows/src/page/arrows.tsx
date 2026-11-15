import type { WorkflowArrow } from "../api.ts";
import { arrowShape } from "../canvas/arrow-path.ts";
import type { Box } from "../canvas/geometry.ts";

/** Props for {@link Arrows}. */
export interface ArrowsProps {
  readonly arrows: readonly WorkflowArrow[];
  readonly boxes: ReadonlyMap<string, Box>;
}

/** The arrows between the step cards as one SVG layer; an arrow to a step that isn't there is left out. */
export function Arrows({ arrows, boxes }: ArrowsProps) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 size-px overflow-visible text-fg-muted"
    >
      {arrows.map((arrow, index) => {
        const from = boxes.get(arrow.from);
        const to = boxes.get(arrow.to);
        if (from === undefined || to === undefined) return null;
        const shape = arrowShape(from, to);
        return (
          // The same two steps can have several arrows, so the position is part of the key.
          <g key={`${arrow.from}>${arrow.to}#${index}`}>
            <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={1.5} />
            <polygon
              points="-6,-4 0,0 -6,4"
              fill="currentColor"
              transform={`translate(${shape.head.x} ${shape.head.y}) rotate(${shape.headAngle})`}
            />
            {arrow.label !== undefined && (
              <text
                x={shape.label.x}
                y={shape.label.y}
                textAnchor="middle"
                className="fill-current text-caption"
              >
                {arrow.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
