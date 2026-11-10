import { useId } from "react";

/** A part knocked out of a filled icon, so its inner details read in any colour. */
interface Cut {
  readonly path: string;
  /** Knock out the shape's inside too, not only its line (the Runs play mark). */
  readonly filled?: boolean;
  /** A thinner line than the icon's, for the gap between two books. */
  readonly strokeWidth?: number;
}

/**
 * One place's drawing on a 24 grid. The outline is drawn as lines. The filled icon keeps the
 * outline's silhouette: `solid` is filled and stroked, `lines` stay lines, and `cuts` are knocked
 * out, so it reads on the halo tint and in forced colours.
 */
interface PlaceDrawing {
  readonly outline: string;
  readonly solid: string;
  readonly lines?: string;
  readonly cuts?: readonly Cut[];
}

/** The place icons (visual review kit T2-F51, HAL-3164), named like the shell's places. */
const drawings = {
  home: {
    outline: "M4 11l8-7 8 7v9h-5v-5h-6v5H4z",
    solid: "M4 11l8-7 8 7v9h-5v-5h-6v5H4z",
  },
  inbox: {
    outline: "M4 13l2.5-8h11l2.5 8v6H4zM4 13h5l1 2h4l1-2h5",
    solid: "M4 13l2.5-8h11l2.5 8v6H4z",
    cuts: [{ path: "M7.5 13H9l1 2h4l1-2h1.5" }],
  },
  agents: {
    outline: "M12 4a4 4 0 110 8 4 4 0 010-8zM4.5 20c.8-3.5 3.8-5.5 7.5-5.5s6.7 2 7.5 5.5",
    solid: "M12 4a4 4 0 110 8 4 4 0 010-8zM4.5 20c.8-3.5 3.8-5.5 7.5-5.5s6.7 2 7.5 5.5z",
  },
  workflows: {
    outline: "M4 4h6v5H4zM14 15h6v5h-6zM7 9v4.5a1.5 1.5 0 001.5 1.5H14",
    solid: "M4 4h6v5H4zM14 15h6v5h-6z",
    lines: "M7 9v4.5a1.5 1.5 0 001.5 1.5H14",
  },
  routines: {
    outline: "M12 4a8 8 0 110 16 8 8 0 010-16zM12 8v4l3 2",
    solid: "M12 4a8 8 0 110 16 8 8 0 010-16z",
    cuts: [{ path: "M12 8v4l3 2" }],
  },
  library: {
    // Two books side by side and one leaning, with clear space before it.
    outline: "M4 4h4v16H4zM8 4h4v16H8zM14.2 19.6l3.2-15.2 3.3.7-3.2 15.2z",
    solid: "M4 4h4v16H4zM8 4h4v16H8zM14.2 19.6l3.2-15.2 3.3.7-3.2 15.2z",
    // Filled, the books would run into one block, so a gap goes between them.
    cuts: [
      { path: "M8 2.5v19", strokeWidth: 1.4 },
      { path: "M13 19.4l3.3-15.5", strokeWidth: 1.4 },
    ],
  },
  runs: {
    outline: "M12 4a8 8 0 110 16 8 8 0 010-16zM10 9v6l5-3z",
    solid: "M12 4a8 8 0 110 16 8 8 0 010-16z",
    cuts: [{ path: "M10 9v6l5-3z", filled: true }],
  },
  changes: {
    // Added over removed: a plus over a minus in a rounded square.
    outline:
      "M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zM12 7.5v5M9.5 10h5M9.5 15.5h5",
    solid: "M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z",
    cuts: [{ path: "M12 7.5v5M9.5 10h5M9.5 15.5h5" }],
  },
} as const satisfies Record<string, PlaceDrawing>;

/** The name of a place icon, the same as the place's key in the shell. */
export type PlaceIconName = keyof typeof drawings;

/** Every place icon's name, in the sidebar's order. */
export const placeIconNames = Object.keys(drawings) as readonly PlaceIconName[];

/** On the 24 grid drawn at 20px, a 1.8 line is the kit's 1.5px line on screen. */
const strokeWidth = 1.8;

/** The props of `PlaceIcon`. */
export interface PlaceIconProps {
  readonly name: PlaceIconName;
  /** The filled icon, for the place where you are; otherwise the outline. */
  readonly filled?: boolean;
}

/**
 * A sidebar place's icon (component specs 24.4): an outline, or filled for the place where you
 * are. It draws in the text colour and fills its box, so the caller sets its size and colour
 * (`size-icon-md`, with `text-accent` where you are). Hidden from screen readers: the place's
 * name says the same.
 */
export function PlaceIcon({ name, filled = false }: PlaceIconProps) {
  const drawing: PlaceDrawing = drawings[name];
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-place-icon={filled ? `${name}-filled` : name}
    >
      {filled ? <FilledDrawing drawing={drawing} /> : <path d={drawing.outline} fill="none" />}
    </svg>
  );
}

function FilledDrawing({ drawing }: { readonly drawing: PlaceDrawing }) {
  // A mask's id is global to the page, and many sidebars or sheets can draw the same icon.
  const maskId = useId();
  const cuts = drawing.cuts ?? [];
  return (
    <>
      {cuts.length > 0 && (
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" stroke="none" />
          {cuts.map((cut) => (
            <path
              key={cut.path}
              d={cut.path}
              fill={cut.filled === true ? "black" : "none"}
              stroke="black"
              strokeWidth={cut.strokeWidth ?? strokeWidth}
            />
          ))}
        </mask>
      )}
      <g mask={cuts.length > 0 ? `url(#${maskId})` : undefined}>
        <path d={drawing.solid} fill="currentColor" />
        {drawing.lines !== undefined && <path d={drawing.lines} fill="none" />}
      </g>
    </>
  );
}
