import type { CSSProperties, ReactNode } from "react";
import type { StepMark } from "../start/run-strip.ts";
import { startWords } from "../start/start-words.ts";

/**
 * The ring or fill and the colour of each mark: the run page's **Every step** dot (component
 * specs 23.5) at the canvas's 10 px. Every dot has a 1.5 px edge, in the fill's own colour on a
 * filled one, so in high contrast, where the fill turns into the background, the edge still draws
 * the dot (HAL-12946).
 */
const looks: Record<StepMark, string> = {
  done: "border-success bg-success text-on-success",
  failed: "border-danger bg-danger text-on-danger",
  waiting: "border-warning bg-warning-soft text-warning",
  running: "border-accent bg-accent-soft text-accent",
  stopped: "border-fg-muted text-fg-muted",
};

/** A 7 px line glyph in the dot's colour. */
function Glyph({ path }: { readonly path: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-[7px]" fill="none" stroke="currentColor" aria-hidden>
      <path d={path} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The mark inside each dot, as on the run page: ✓, ×, ‖, the live dot, the square. */
const marks: Record<StepMark, ReactNode> = {
  done: <Glyph path="M3 8.5 6.5 12 13 4.5" />,
  failed: <Glyph path="M4.5 4.5l7 7m0-7-7 7" />,
  waiting: <Glyph path="M6 4.5v7m4-7v7" />,
  running: <span className="size-1 rounded-full bg-current forced-color-adjust-none" />,
  stopped: <span className="size-1 bg-current forced-color-adjust-none" />,
};

/**
 * A step card's status dot: how the step stands in the shown run, by its mark and its colour, so
 * colour is never alone (`workflows.canvas.status-dots`, 23 A11), and in words for assistive
 * technology. `style` places and sizes it on the card.
 */
export function StatusDot({
  mark,
  style,
}: {
  readonly mark: StepMark;
  readonly style: CSSProperties;
}) {
  return (
    <span
      data-testid="status-dot"
      data-mark={mark}
      style={style}
      className={`absolute flex items-center justify-center rounded-full border-[1.5px] ${looks[mark]}`}
    >
      {marks[mark]}
      <span className="sr-only">{startWords.mark[mark]}</span>
    </span>
  );
}
