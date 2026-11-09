import type { ReactNode } from "react";

/**
 * The chip's colour, which says what kind of state it is. `warning` is "Needs you". `outline` is
 * a tag: a fact about the item ("Test"), not its state.
 */
export type StatusChipTone =
  | "neutral"
  | "accent"
  | "running"
  | "warning"
  | "danger"
  | "success"
  | "outline";

export interface StatusChipProps {
  /** Always a word ("Running", "Needs you"), or a number for a count: colour is never alone. */
  readonly children: ReactNode;
  readonly tone?: StatusChipTone;
  /** A still 6px dot before the word, for a live state: running, needs you, failed, done. */
  readonly dot?: boolean;
  /** `count` is the round counter on a sidebar item or a tab, with tabular figures. */
  readonly shape?: "chip" | "count";
}

/** Each coloured tone is its colour on its own `-soft` fill, which passes AA on every surface. */
const toneClasses: Record<StatusChipTone, string> = {
  neutral: "bg-surface-muted text-fg-muted",
  accent: "bg-accent-soft text-accent-text",
  running: "bg-running-soft text-running",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  outline: "text-fg-muted",
};

/**
 * Every chip has a 1px edge: see-through normally, so Windows high-contrast mode can draw it, and
 * in its own colour when more contrast is asked for (component specs 23.5). A tag's edge always
 * shows.
 */
function edgeClasses(tone: StatusChipTone): string {
  if (tone === "outline") {
    return "border border-border-strong";
  }
  return "border border-transparent contrast-more:border-current";
}

const shapeClasses = {
  chip: "rounded-xs px-1.5",
  count: "min-w-5 justify-center rounded-full px-1.5 tabular-nums",
} as const;

/**
 * The state of an item, in a row, a card header or a panel. Not interactive: a thing you can click
 * is a Button or a row, never a chip.
 *
 * @example
 * <StatusChip tone="running" dot>Running</StatusChip>
 * <StatusChip tone="warning" dot>Needs you</StatusChip>
 * <StatusChip tone="outline">Test</StatusChip>
 * <StatusChip tone="accent" shape="count">3</StatusChip>
 */
export function StatusChip({
  children,
  tone = "neutral",
  dot = false,
  shape = "chip",
}: StatusChipProps) {
  const classes = [
    "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap text-caption",
    toneClasses[tone],
    edgeClasses(tone),
    shapeClasses[shape],
  ].join(" ");

  return (
    <span className={classes}>
      {dot ? (
        <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}
