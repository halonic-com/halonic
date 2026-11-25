import { teamWords } from "../team-words.ts";

/** The marks on every meter: where a seat or a budget starts to need a look, and where it's urgent. */
const ticks = [80, 90] as const;

/** The fill's colour by how much is used: as the seat states, attention from 80% and danger from 90%. */
function fillClass(percent: number): string {
  if (percent >= 90) return "bg-danger";
  if (percent >= 80) return "bg-attention";
  return "bg-accent";
}

/**
 * How much of a week or a budget is used: a bar with ticks at 80% and 90%, and the percent on the
 * right in tabular figures (HAL-17515 s01, s05). The bar is only for the eye; the percent is the
 * words. In high contrast the track's edge, the fill and the ticks are drawn in the text colour,
 * and each tick has a 1px outline in the page colour so it still shows where the fill passes it.
 * A `greyed` meter shows numbers that may be out of date, a seat signed out or not read (S1, S6):
 * its fill is grey whatever the percent, so an old reading never looks like a live warning.
 */
export function UsageMeter(props: { readonly percent: number; readonly greyed?: boolean }) {
  const { percent } = props;
  const fill = props.greyed === true ? "bg-fg-disabled" : fillClass(percent);
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="relative block h-1.5 min-w-12 flex-1 rounded-full border border-transparent bg-surface-muted forced-color-adjust-none forced-colors:border-[CanvasText]"
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${fill} forced-colors:bg-[CanvasText]`}
          style={{ width: `${width}%` }}
        />
        {ticks.map((at) => (
          <span
            key={at}
            className="absolute -inset-y-1 w-px bg-fg-muted forced-colors:bg-[CanvasText] forced-colors:outline forced-colors:outline-[Canvas]"
            style={{ left: `${at}%` }}
          />
        ))}
      </span>
      <span className="shrink-0 text-right text-small tabular-nums">
        {teamWords.percent(Math.round(percent))}
      </span>
    </span>
  );
}
