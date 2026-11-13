import { useId } from "react";
import { limitSeries, OTHER_NAME, type Series, spreadLabels } from "./series.ts";

/** Props for {@link SeriesChart}. */
export interface SeriesChartProps {
  /** The chart's name: the card's title and the chart's text alternative. */
  readonly title: string;
  /** The x positions' names, one per value of each series ("Jun", "Jul"). */
  readonly labels: readonly string[];
  readonly series: readonly Series[];
  /** Writes a value for the text alternative ("$12.40"). Default: the number as it is. */
  readonly format?: (value: number) => string;
}

// Literal class names, so the stylesheet scan finds every one.
const strokes = ["stroke-series-1", "stroke-series-2", "stroke-series-3", "stroke-series-4"];
const fills = ["fill-series-1", "fill-series-2", "fill-series-3", "fill-series-4"];

const WIDTH = 480;
const HEIGHT = 200;
const LEFT = 8;
const RIGHT = 112;
const TOP = 12;
const BOTTOM = 28;
const LABEL_GAP = 14;

/** The first x name starts at the chart's edge and the last ends at it, so neither is cut. */
function anchorOf(at: number, count: number): "start" | "middle" | "end" {
  if (at === 0) {
    return "start";
  }
  return at === count - 1 ? "end" : "middle";
}

/**
 * Up to four lines over the same x positions, each named at its end rather than in a legend. The
 * colours are the kit's series colours in order, so a name is never the only difference but is
 * always there to carry it. Names that would touch are nudged apart. With more than four series
 * the three largest keep their lines and the rest are summed into a slate "Other". The coloured
 * text needs the surface of a card behind it, so the chart always draws itself on one.
 *
 * @example
 * <SeriesChart title="Spend by agent" labels={["Jun", "Jul"]} series={[{ name: "Mia", values: [3, 5] }]} />
 */
export function SeriesChart({ title, labels, series, format = String }: SeriesChartProps) {
  const titleId = useId();
  const lines = limitSeries(series);
  const top = Math.max(1, ...lines.flatMap((one) => one.values));
  const steps = Math.max(1, labels.length - 1);
  const x = (at: number) => LEFT + (at / steps) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => TOP + (1 - value / top) * (HEIGHT - TOP - BOTTOM);
  const nameYs = spreadLabels(
    lines.map((one) => y(one.values.at(-1) ?? 0)),
    LABEL_GAP,
    TOP,
    HEIGHT - BOTTOM,
  );
  return (
    <section className="rounded-md border border-border bg-surface p-4 text-body">
      <h3 id={titleId} className="text-label uppercase text-fg-muted">
        {title}
      </h3>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-3 w-full"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-text`}
      >
        <title>{title}</title>
        {lines.map((one, at) => {
          const isOther = one.name === OTHER_NAME && at === lines.length - 1 && series.length > 4;
          const stroke = isOther ? "stroke-series-other" : strokes[at];
          const fill = isOther ? "fill-series-other" : fills[at];
          const points = one.values.map((value, i) => `${x(i)},${y(value)}`).join(" ");
          return (
            <g key={one.name}>
              <polyline
                points={points}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                className={stroke}
              />
              <text
                x={WIDTH - RIGHT + 8}
                y={(nameYs[at] as number) + 4}
                className={`${fill} text-label`}
                fontSize={12}
              >
                {one.name}
              </text>
            </g>
          );
        })}
        {labels.map((name, at) => (
          <text
            key={name}
            x={x(at)}
            y={HEIGHT - 8}
            textAnchor={anchorOf(at, labels.length)}
            className="fill-fg-subtle text-caption tabular-nums"
            fontSize={12}
          >
            {name}
          </text>
        ))}
      </svg>
      <p id={`${titleId}-text`} className="sr-only">
        {lines
          .map((one) => `${one.name}: ${one.values.map((v) => format(v)).join(", ")}`)
          .join(". ")}
        {`. Across ${labels.join(", ")}.`}
      </p>
    </section>
  );
}
