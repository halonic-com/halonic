/** One line on a chart: its name and one value per x position. */
export interface Series {
  readonly name: string;
  readonly values: readonly number[];
}

/** Most series a chart draws in their own colour; more are summed into "Other". */
export const MAX_SERIES = 4;

/** The name the summed rest is drawn under. */
export const OTHER_NAME = "Other";

/**
 * Keeps a chart to four lines. With more than four series, the three with the largest last value
 * keep their place and colour, and the rest are summed, position by position, into "Other".
 */
export function limitSeries(series: readonly Series[]): readonly Series[] {
  if (series.length <= MAX_SERIES) {
    return series;
  }
  const last = (one: Series) => one.values.at(-1) ?? 0;
  const ranked = [...series].sort((a, b) => last(b) - last(a));
  const kept = new Set(ranked.slice(0, MAX_SERIES - 1));
  const top = series.filter((one) => kept.has(one));
  const rest = series.filter((one) => !kept.has(one));
  const length = Math.max(...rest.map((one) => one.values.length));
  const other = Array.from({ length }, (_, at) =>
    rest.reduce((sum, one) => sum + (one.values[at] ?? 0), 0),
  );
  return [...top, { name: OTHER_NAME, values: other }];
}

/**
 * Where to draw each name at the line ends: as near its wanted height as possible, but at least
 * `gap` apart, kept between `min` and `max`. Returns the heights in the order given.
 */
export function spreadLabels(
  wanted: readonly number[],
  gap: number,
  min: number,
  max: number,
): readonly number[] {
  const order = wanted.map((y, at) => ({ y, at })).sort((a, b) => a.y - b.y);
  const placed = order.map(({ y }) => Math.min(Math.max(y, min), max));
  for (let i = 1; i < placed.length; i++) {
    placed[i] = Math.max(placed[i] as number, (placed[i - 1] as number) + gap);
  }
  // Pushing down may run past `max`: push back up from the end.
  for (let i = placed.length - 1; i >= 0; i--) {
    const limit = i === placed.length - 1 ? max : (placed[i + 1] as number) - gap;
    placed[i] = Math.min(placed[i] as number, limit);
  }
  const result = new Array<number>(wanted.length).fill(0);
  order.forEach(({ at }, i) => {
    result[at] = placed[i] as number;
  });
  return result;
}
