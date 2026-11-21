// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { type SetupStep, SetupSteps } from "./setup-steps.tsx";

const now = new Date("2026-11-21T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

type StepId = "model" | "agent";

const cause =
  "Ollama isn't answering at localhost:11434. Start Ollama, or add an API key for a cloud model.";

const agent: SetupStep<StepId> = {
  id: "agent",
  title: "Make your first agent",
  hint: "Give it a name and say what it should do.",
  done: false,
  label: "Step 2 of 2: Make your first agent, not done",
};

function model(check: SetupStep["check"], done = false): SetupStep<StepId> {
  return {
    id: "model",
    title: "Connect a model",
    hint: "Start Ollama, or add a key for a cloud model.",
    done,
    label: `Step 1 of 2: Connect a model, ${check?.state === "problem" ? "problem" : "not done"}`,
    ...(check === undefined ? {} : { check }),
  };
}

function checking(secondsAgo: number): SetupStep["check"] {
  return {
    state: "checking",
    what: (
      <>
        Checking Ollama at <code>localhost:11434</code>…
      </>
    ),
    since: new Date(now.getTime() - secondsAgo * 1000),
  };
}

function problem(onCheck = vi.fn(), onModels = vi.fn(), onHelp = vi.fn()): SetupStep["check"] {
  return {
    state: "problem",
    cause,
    actions: [
      { label: "Check again", onClick: onCheck },
      { label: "Open Models", onClick: onModels },
      { label: "Something wrong?", onClick: onHelp },
    ],
  };
}

function cellsOf(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="gridcell"]')];
}

function circleOf(cell: HTMLElement | undefined): HTMLElement | null {
  return cell?.querySelector<HTMLElement>('[aria-hidden="true"] > .rounded-full') ?? null;
}

function chevronOf(cell: HTMLElement | undefined): Element | null {
  return cell?.querySelector(".text-fg-subtle > svg") ?? null;
}

verifies("kit.setup-steps-check", () => {
  it("draws a step whose check runs with a running circle and the waiting line under its hint", () => {
    const { container } = render(
      <SetupSteps label="Get set up" steps={[model(checking(3)), agent]} onOpen={vi.fn()} />,
    );
    const [step, next] = cellsOf(container);
    const circle = circleOf(step);
    expect(circle?.textContent).toBe("1");
    expect(circle?.className).toContain("border-running text-running");
    const status = step?.querySelector('[role="status"]');
    expect(status?.textContent).toBe("Checking Ollama at localhost:11434…");
    expect(step?.textContent).toContain("Start Ollama, or add a key for a cloud model.");
    expect(step?.textContent).toContain("3 s");
    expect(chevronOf(step)).not.toBeNull();
    // The other step is drawn as it would be.
    expect(circleOf(next)?.className).toContain("border-border-strong text-fg-muted");
  });

  it("counts from the check's start, showing nothing before 2 seconds but keeping its status region", () => {
    const { container } = render(
      <SetupSteps label="Get set up" steps={[model(checking(1)), agent]} onOpen={vi.fn()} />,
    );
    const [step] = cellsOf(container);
    const status = step?.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toBe("");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(step?.querySelector('[role="status"]')).toBe(status);
    expect(status?.textContent).toBe("Checking Ollama at localhost:11434…");
    expect(step?.textContent).toContain("3 s");
  });

  it('draws a problem as an amber "!", the cause in the hint\'s place and the ways out in order', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <SetupSteps label="Get set up" steps={[model(problem()), agent]} onOpen={onOpen} />,
    );
    const [step, next] = cellsOf(container);
    const circle = circleOf(step);
    expect(circle?.textContent).toBe("!");
    expect(circle?.className).toContain("border-attention");
    expect(circle?.className).toContain("text-attention");
    expect(circle?.className).not.toContain("danger");
    expect(step?.textContent).not.toContain("Start Ollama, or add a key for a cloud model.");
    const describedBy = step?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(cause);
    expect(step?.getAttribute("aria-label")).toBe("Step 1 of 2: Connect a model, problem");
    expect(
      [...(step?.querySelectorAll("button") ?? [])].map((button) => button.textContent),
    ).toEqual(["Check again", "Open Models", "Something wrong?"]);
    expect(chevronOf(step)).not.toBeNull();
    // A problem in step 1 never locks step 2.
    act(() => next?.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("agent");
  });

  it("calls an action without opening the step, and still opens it from the rest of the row", () => {
    const onCheck = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <SetupSteps label="Get set up" steps={[model(problem(onCheck)), agent]} onOpen={onOpen} />,
    );
    const [step] = cellsOf(container);
    const checkAgain = step?.querySelector("button");
    act(() => checkAgain?.click());
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    act(() => step?.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("model");
  });

  it("draws no check on a done step", () => {
    const { container } = render(
      <SetupSteps label="Get set up" steps={[model(problem(), true), agent]} onOpen={vi.fn()} />,
    );
    const [step] = cellsOf(container);
    expect(circleOf(step)?.className).toContain("bg-success");
    expect(step?.textContent).toContain("Start Ollama, or add a key for a cloud model.");
    expect(step?.querySelector("button")).toBeNull();
    expect(step?.querySelector('[role="status"]')).toBeNull();
  });
});
