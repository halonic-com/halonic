// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { limitSeries, spreadLabels } from "./series.ts";
import { SeriesChart } from "./series-chart.tsx";

afterEach(() => {
  unmountAll();
});

const labels = ["Jun", "Jul", "Aug"];
const named = (name: string, last: number) => ({ name, values: [1, 2, last] });

/** The text of each series name drawn at a line's end, in order. */
function names(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("svg g text"), (text) => text.textContent ?? "");
}

verifies("kit.series-chart", () => {
  it("draws up to four lines in blue, rose, teal and periwinkle, each named at its end", () => {
    const series = [named("A", 4), named("B", 3), named("C", 2), named("D", 1)];
    const { container } = render(<SeriesChart title="Spend" labels={labels} series={series} />);
    const lines = Array.from(container.querySelectorAll("polyline"));
    expect(lines.map((line) => line.getAttribute("class"))).toEqual([
      "stroke-series-1",
      "stroke-series-2",
      "stroke-series-3",
      "stroke-series-4",
    ]);
    expect(names(container)).toEqual(["A", "B", "C", "D"]);
    expect(container.querySelector("g text")?.getAttribute("class")).toContain("fill-series-1");
  });

  it("sits on a card and is named by its title", () => {
    const { container } = render(
      <SeriesChart title="Spend by agent" labels={labels} series={[named("A", 1)]} />,
    );
    expect(container.firstElementChild?.className).toContain("bg-surface");
    const svg = container.querySelector("svg") as SVGElement;
    const heading = document.getElementById(svg.getAttribute("aria-labelledby") ?? "");
    expect(heading?.textContent).toBe("Spend by agent");
  });

  it("gives screen readers every series' values as text", () => {
    const { container } = render(
      <SeriesChart
        title="Spend"
        labels={labels}
        series={[named("A", 4)]}
        format={(v) => `$${v}`}
      />,
    );
    expect(container.querySelector(".sr-only")?.textContent).toBe(
      "A: $1, $2, $4. Across Jun, Jul, Aug.",
    );
  });

  it("keeps the three largest of more than four series and sums the rest into Other", () => {
    const series = [
      named("A", 10),
      named("B", 1),
      named("C", 9),
      named("D", 2),
      named("E", 8),
      named("F", 3),
    ];
    const limited = limitSeries(series);
    expect(limited.map((one) => one.name)).toEqual(["A", "C", "E", "Other"]);
    expect(limited[3]?.values).toEqual([3, 6, 6]);
    const { container } = render(<SeriesChart title="Spend" labels={labels} series={series} />);
    const lines = Array.from(container.querySelectorAll("polyline"));
    expect(lines.at(-1)?.getAttribute("class")).toBe("stroke-series-other");
  });

  it("nudges names that would touch apart, within the chart", () => {
    const placed = spreadLabels([100, 100, 101], 14, 12, 172);
    const [first = 0, second = 0, third = 0] = [...placed].sort((a, b) => a - b);
    expect(second - first).toBeGreaterThanOrEqual(14);
    expect(third - second).toBeGreaterThanOrEqual(14);
    const atFloor = spreadLabels([172, 172], 14, 12, 172);
    expect(Math.max(...atFloor)).toBe(172);
    expect(Math.min(...atFloor)).toBe(158);
  });
});
