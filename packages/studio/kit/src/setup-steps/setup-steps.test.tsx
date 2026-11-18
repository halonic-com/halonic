// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { type SetupStep, SetupSteps } from "./setup-steps.tsx";

afterEach(() => {
  unmountAll();
});

const steps: SetupStep<"start" | "decide">[] = [
  {
    id: "start",
    title: "Start a support request",
    hint: "An invented customer asks for a refund.",
    done: true,
    label: "Step 1 of 2: Start a support request, done",
  },
  {
    id: "decide",
    title: "Approve or reject the reply",
    hint: "The run waits for you before it finishes.",
    done: false,
    label: "Step 2 of 2: Approve or reject the reply, not done",
  },
];

/** Each row's main cell, the one a screen reader reads and a click opens. */
function cellsOf(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="gridcell"]')];
}

/** The parts of a row a sighted user sees: the circle, the title and the chevron. */
function partsOf(cell: HTMLElement) {
  const circle = cell.querySelector<HTMLElement>('[aria-hidden="true"] > .rounded-full');
  const title = [...cell.querySelectorAll<HTMLElement>("span")].find((span) =>
    span.className.includes("text-body-strong"),
  );
  const chevron = cell.querySelector<HTMLElement>(".text-fg-subtle > svg");
  return { circle, title, chevron };
}

verifies("kit.setup-steps", () => {
  it("draws a done step with a success tick, a muted title and no chevron", () => {
    const { container } = render(
      <SetupSteps label="Try the sample" steps={steps} onOpen={vi.fn()} />,
    );
    const [done] = cellsOf(container);
    if (done === undefined) throw new Error("no rows");
    const { circle, title, chevron } = partsOf(done);
    expect(circle?.className).toContain("size-6");
    expect(circle?.className).toContain("bg-success text-on-success");
    expect(circle?.querySelector("svg")).not.toBeNull();
    expect(circle?.textContent).toBe("");
    expect(title?.textContent).toBe("Start a support request");
    expect(title?.className).toContain("text-fg-muted");
    expect(title?.className).not.toContain("line-through");
    expect(chevron).toBeNull();
  });

  it("draws a step to do with its number in an outlined circle, a full-strength title and a chevron", () => {
    const { container } = render(
      <SetupSteps label="Try the sample" steps={steps} onOpen={vi.fn()} />,
    );
    const todo = cellsOf(container)[1];
    if (todo === undefined) throw new Error("no second row");
    const { circle, title, chevron } = partsOf(todo);
    expect(circle?.textContent).toBe("2");
    expect(circle?.className).toContain("size-6");
    expect(circle?.className).toContain("border-border-strong text-fg-muted");
    expect(title?.className.split(" ")).toContain("text-fg");
    expect(chevron).not.toBeNull();
    expect(todo.textContent).toContain("The run waits for you before it finishes.");
  });

  it("reads each row as its label and opens a step by its row", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <SetupSteps label="Try the sample" steps={steps} onOpen={onOpen} />,
    );
    expect(container.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe(
      "Try the sample",
    );
    const cells = cellsOf(container);
    expect(cells.map((cell) => cell.getAttribute("aria-label"))).toEqual(
      steps.map((step) => step.label),
    );
    act(() => cells[1]?.click());
    expect(onOpen).toHaveBeenCalledWith("decide");
  });
});
