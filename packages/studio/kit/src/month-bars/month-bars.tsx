import { useId } from "react";

/** One month on {@link MonthBars}. */
export interface Month {
  /** The month's short name ("Jun"). */
  readonly label: string;
  readonly value: number;
  /** What was planned for the month. A month whose value goes over it is drawn amber. */
  readonly budget?: number;
}

/** Props for {@link MonthBars}. */
export interface MonthBarsProps {
  /** The card's title and the chart's text alternative. */
  readonly title: string;
  /** The months in time order, oldest first. The last one is the current month. */
  readonly months: readonly Month[];
  /** Writes a value ("$12.40"). Default: the number as it is. */
  readonly format?: (value: number) => string;
  /** Shown instead of the bars when every month is zero. */
  readonly emptyText: string;
}

/** How many months the chart shows. */
export const MONTH_COUNT = 6;

const WIDTH = 360;
const HEIGHT = 120;
const BOTTOM = 22;
const GAP = 8;

/** A month is over budget when it has a budget and its value is above it. */
export function isOverBudget(month: Month): boolean {
  return month.budget !== undefined && month.value > month.budget;
}

// Literal class names, so the stylesheet scan finds every one.
function barFill(month: Month, isCurrent: boolean): string {
  if (isOverBudget(month)) {
    return "fill-attention-fill";
  }
  return isCurrent ? "fill-series-1" : "fill-series-other";
}

/**
 * Spend per month as bars on a card, for the last six months: the current month in blue, earlier
 * months in a quiet slate, and any month over its budget in amber. The current month's value is
 * the one big number, in normal digits; the labels under the bars use equal-width digits. When
 * every month is zero it says so instead of drawing empty bars. Screen readers get each month's
 * value, and which are over budget, as text.
 *
 * @example
 * <MonthBars title="Bills" months={[{ label: "Jun", value: 40 }]} emptyText="No bills yet" />
 */
export function MonthBars({ title, months, format = String, emptyText }: MonthBarsProps) {
  const titleId = useId();
  const shown = months.slice(-MONTH_COUNT);
  const current = shown.at(-1);
  const empty = shown.every((month) => month.value === 0);
  const top = Math.max(1, ...shown.flatMap((month) => [month.value, month.budget ?? 0]));
  const slot = (WIDTH - GAP * (shown.length - 1)) / Math.max(1, shown.length);
  return (
    <section className="rounded-md border border-border bg-surface p-4 text-body">
      <h3 id={titleId} className="text-label uppercase text-fg-muted">
        {title}
      </h3>
      {empty || current === undefined ? (
        <p className="mt-3 text-fg-muted">{emptyText}</p>
      ) : (
        <>
          <p className="mt-2 text-title text-fg">{format(current.value)}</p>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="mt-3 w-full"
            role="img"
            aria-labelledby={titleId}
            aria-describedby={`${titleId}-text`}
          >
            <title>{title}</title>
            {shown.map((month, at) => {
              const height = (Math.max(0, month.value) / top) * (HEIGHT - BOTTOM);
              const x = at * (slot + GAP);
              const fill = barFill(month, at === shown.length - 1);
              return (
                <g key={at}>
                  <rect
                    x={x}
                    y={HEIGHT - BOTTOM - height}
                    width={slot}
                    height={height}
                    rx={3}
                    className={fill}
                  />
                  <text
                    x={x + slot / 2}
                    y={HEIGHT - 6}
                    textAnchor="middle"
                    className="fill-fg-subtle text-caption tabular-nums"
                    fontSize={12}
                  >
                    {month.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p id={`${titleId}-text`} className="sr-only">
            {shown
              .map(
                (month) =>
                  `${month.label}: ${format(month.value)}${isOverBudget(month) ? ", over budget" : ""}`,
              )
              .join(". ")}
            .
          </p>
        </>
      )}
    </section>
  );
}
