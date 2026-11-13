// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { MonthBars } from "./month-bars.tsx";

afterEach(() => {
  unmountAll();
});

const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
const months = names.map((label, at) => ({ label, value: (at + 1) * 10 }));

function bars(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("rect"), (rect) => rect.getAttribute("class") ?? "");
}

verifies("kit.month-bars", () => {
  it("draws only the last six months", () => {
    const { container } = render(<MonthBars title="Bills" months={months} emptyText="None" />);
    expect(bars(container)).toHaveLength(6);
    expect(Array.from(container.querySelectorAll("svg text"), (t) => t.textContent)).toEqual(
      names.slice(2),
    );
  });

  it("draws the current month in blue and earlier months in slate", () => {
    const { container } = render(<MonthBars title="Bills" months={months} emptyText="None" />);
    expect(bars(container)).toEqual([...Array(5).fill("fill-series-other"), "fill-series-1"]);
    const big = container.querySelector("p:not(.sr-only)");
    expect(big?.textContent).toBe("80");
    expect(big?.className).toContain("text-title");
  });

  it("draws a month over its budget in amber and says so in text", () => {
    const over = [
      { label: "May", value: 5 },
      { label: "Jun", value: 120, budget: 100 },
      { label: "Jul", value: 50, budget: 100 },
    ];
    const { container } = render(<MonthBars title="Bills" months={over} emptyText="None" />);
    expect(bars(container)).toEqual(["fill-series-other", "fill-attention-fill", "fill-series-1"]);
    expect(container.querySelector(".sr-only")?.textContent).toBe(
      "May: 5. Jun: 120, over budget. Jul: 50.",
    );
  });

  it("draws a negative month with no height, never a negative one", () => {
    const refund = [
      { label: "May", value: -20 },
      { label: "Jun", value: 30 },
    ];
    const { container } = render(<MonthBars title="Bills" months={refund} emptyText="None" />);
    const heights = Array.from(container.querySelectorAll("rect"), (r) => r.getAttribute("height"));
    expect(heights[0]).toBe("0");
    expect(Number(heights[1])).toBeGreaterThan(0);
  });

  it("keeps two months with the same label", () => {
    const twin = [
      { label: "Jun", value: 10 },
      { label: "Jun", value: 20 },
    ];
    const { container } = render(<MonthBars title="Bills" months={twin} emptyText="None" />);
    expect(bars(container)).toHaveLength(2);
  });

  it("names the chart by its title", () => {
    const { container } = render(<MonthBars title="Bills" months={months} emptyText="None" />);
    expect(container.querySelector("svg title")?.textContent).toBe("Bills");
  });

  it("shows the empty text instead of bars when every month is zero", () => {
    const zero = names.map((label) => ({ label, value: 0 }));
    const { container } = render(
      <MonthBars title="Bills" months={zero} emptyText="No bills yet" />,
    );
    expect(bars(container)).toHaveLength(0);
    expect(container.textContent).toContain("No bills yet");
  });

  it("shows a note under the big number, amber when it needs attention", () => {
    const { container } = render(
      <MonthBars
        title="Bills"
        months={months}
        emptyText="None"
        note={{ text: "This month, over the 100 EUR budget", attention: true }}
      />,
    );
    const note = container.querySelector("p.text-attention");
    expect(note?.textContent).toBe("This month, over the 100 EUR budget");
    const plain = render(
      <MonthBars title="Bills" months={months} emptyText="None" note={{ text: "This month" }} />,
    );
    expect(plain.container.querySelector("p.text-attention")).toBeNull();
    expect(plain.container.textContent).toContain("This month");
  });

  it("draws a dashed line at the limit, labelled, and keeps it in the scale", () => {
    const low = [{ label: "Jun", value: 10 }];
    const { container } = render(
      <MonthBars
        title="Bills"
        months={low}
        emptyText="None"
        limit={{ value: 100, label: "Budget" }}
      />,
    );
    const line = container.querySelector("line");
    expect(line?.getAttribute("stroke-dasharray")).toBe("4 4");
    // The limit is the top of the scale, so the 10 bar is a tenth of it and the line is at the top
    // of the plot, below the label's headroom.
    expect(Number(line?.getAttribute("y1"))).toBeGreaterThan(0);
    expect(container.querySelector("svg g:last-child text")?.textContent).toBe("Budget");
  });

  it("keeps the limit's label inside the picture, at the left end, with a halo", () => {
    const tall = [{ label: "Jun", value: 100 }];
    const { container } = render(
      <MonthBars
        title="Bills"
        months={tall}
        emptyText="None"
        limit={{ value: 100, label: "Budget" }}
      />,
    );
    const label = container.querySelector("svg g:last-child text");
    expect(Number(label?.getAttribute("y"))).toBeGreaterThanOrEqual(0);
    expect(Number(container.querySelector("line")?.getAttribute("y1"))).toBeGreaterThan(0);
    expect(label?.getAttribute("x")).toBe("0");
    expect(label?.getAttribute("text-anchor")).toBe("start");
    expect(label?.getAttribute("paint-order")).toBe("stroke");
  });

  it("draws no line without a limit", () => {
    const { container } = render(<MonthBars title="Bills" months={months} emptyText="None" />);
    expect(container.querySelector("line")).toBeNull();
  });
});
