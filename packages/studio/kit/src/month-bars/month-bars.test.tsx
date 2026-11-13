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
    expect(container.querySelector("p:not(.sr-only)")?.textContent).toBe("80");
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
});
