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

interface StatusChipBase {
  /** Always a word ("Running", "Needs you"), or a number for a count: colour is never alone. */
  readonly children: ReactNode;
  readonly tone?: StatusChipTone;
  /** A still 6px dot before the word, for a live state: running, needs you, failed, done. */
  readonly dot?: boolean;
}

/** A word: the state of an item, or a tag. */
interface WordChip extends StatusChipBase {
  readonly shape?: "chip";
  readonly name?: never;
}

/** The round counter on a sidebar item or a tab, with tabular figures. */
interface CountChip extends StatusChipBase {
  readonly shape: "count";
  /**
   * What the number means, in words: "3 waiting", "2 errors". Screen readers hear it after the
   * item's name ("Inbox, 3 waiting") instead of the bare number (component specs 23 A10).
   */
  readonly name: string;
}

export type StatusChipProps = WordChip | CountChip;

/** Each coloured tone is its colour on its own `-soft` fill, which passes AA on every surface. */
const toneClasses: Record<StatusChipTone, string> = {
  // On a muted fill (an unselected tab, a hovered row) the neutral box steps up to stay visible.
  // With more contrast border is too dark for the text, so it's surface, set apart by its edge.
  neutral:
    "bg-surface-muted text-fg-muted on-muted:bg-border on-muted:text-fg contrast-more:on-muted:bg-surface",
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
 * <StatusChip tone="accent" shape="count" name="3 waiting">3</StatusChip>
 */
export function StatusChip(props: StatusChipProps) {
  const { children, tone = "neutral", dot = false, shape = "chip" } = props;
  const classes = [
    "inline-flex min-h-5 shrink-0 items-center gap-1 whitespace-nowrap text-caption",
    toneClasses[tone],
    edgeClasses(tone),
    shapeClasses[shape],
  ].join(" ");

  return (
    <span className={classes}>
      {dot ? (
        // High contrast drops fills; the dot keeps its fill in the chip's text colour.
        <span
          className="size-1.5 shrink-0 rounded-full bg-current forced-color-adjust-none"
          aria-hidden="true"
        />
      ) : null}
      {props.name === undefined ? (
        children
      ) : (
        <>
          <span aria-hidden="true">{children}</span>
          <span className="sr-only">, {props.name}</span>
        </>
      )}
    </span>
  );
}
