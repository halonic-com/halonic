// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(() => {
  unmountAll();
});

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function mainCells(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="gridcell"]')];
}

/** The row's text buttons, by their words. */
function actionNamed(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (button === undefined) throw new Error(`No action "${label}".`);
  return button;
}

function modelRow(onCheck: () => void, onModels: () => void): ListRow {
  return {
    id: "model",
    title: "Connect a model",
    meta: "Ollama isn't answering at localhost:11434.",
    actions: [
      { label: "Check again", onClick: onCheck },
      { label: "Open Models", onClick: onModels },
    ],
  };
}

verifies("kit.list-row-actions", () => {
  it("draws the actions as text buttons under the meta line, in order, inside the row", () => {
    const { container } = render(
      <List label="Get set up" rows={[modelRow(vi.fn(), vi.fn())]} onOpen={vi.fn()} />,
    );
    const [cell] = mainCells(container);
    const buttons = [...(cell?.querySelectorAll("button") ?? [])];
    expect(buttons.map((button) => button.textContent)).toEqual(["Check again", "Open Models"]);
    expect(buttons[0]?.className).toContain("text-accent-text");
    // Under the meta line, in the text column, wrapping when they don't fit.
    const meta = [...(cell?.querySelectorAll("span") ?? [])].find(
      (span) => span.textContent === "Ollama isn't answering at localhost:11434.",
    );
    expect(meta?.nextElementSibling).toBe(buttons[0]?.parentElement);
    expect(buttons[0]?.parentElement?.className).toContain("flex-wrap");
  });

  it("reaches each action with → as a cell of the grid, and keeps the List one Tab stop", () => {
    const onModels = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <List label="Get set up" rows={[modelRow(vi.fn(), onModels)]} onOpen={onOpen} />,
    );
    const [cell] = mainCells(container);
    const check = actionNamed(container, "Check again");
    const models = actionNamed(container, "Open Models");
    expect(cell?.tabIndex).toBe(0);
    expect(check.tabIndex).toBe(-1);
    expect(models.tabIndex).toBe(-1);
    act(() => cell?.focus());
    press(cell as HTMLElement, "ArrowRight");
    expect(document.activeElement).toBe(check);
    press(check, "ArrowRight");
    expect(document.activeElement).toBe(models);
    expect(models.tabIndex).toBe(0);
    expect(cell?.tabIndex).toBe(-1);
    // Enter is the button's own: it doesn't open the row.
    press(models, "Enter");
    expect(onOpen).not.toHaveBeenCalled();
    press(models, "ArrowLeft");
    expect(document.activeElement).toBe(check);
  });

  it("calls an action's onClick on a click, and doesn't open the row", () => {
    const onCheck = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <List label="Get set up" rows={[modelRow(onCheck, vi.fn())]} onOpen={onOpen} />,
    );
    act(() => actionNamed(container, "Check again").click());
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    act(() => mainCells(container)[0]?.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("model");
  });

  it("draws under below the meta line, inside the row", () => {
    const { container } = render(
      <List
        label="Get set up"
        rows={[
          {
            id: "model",
            title: "Connect a model",
            meta: "Start Ollama, or add a key for a cloud model.",
            under: <p data-part="line">Checking Ollama at localhost:11434…</p>,
          },
        ]}
        onOpen={vi.fn()}
      />,
    );
    const line = mainCells(container)[0]?.querySelector('[data-part="line"]');
    expect(line?.previousElementSibling?.textContent).toBe(
      "Start Ollama, or add a key for a cloud model.",
    );
  });

  it("keeps the More buttons in one column when only some rows have actions", () => {
    const more = (name: string) => ({ label: `More actions for ${name}`, onClick: vi.fn() });
    const { container } = render(
      <List
        label="Agents"
        rows={[
          { ...modelRow(vi.fn(), vi.fn()), more: more("Connect a model") },
          { id: "sorter", title: "Sorter", more: more("Sorter") },
        ]}
        onOpen={vi.fn()}
      />,
    );
    const firstMore = container.querySelector<HTMLElement>(
      '[aria-label="More actions for Connect a model"]',
    );
    const secondMore = container.querySelector<HTMLElement>(
      '[aria-label="More actions for Sorter"]',
    );
    act(() => secondMore?.focus());
    press(secondMore as HTMLElement, "ArrowUp");
    expect(document.activeElement).toBe(firstMore);
    // From the first row's last action, → goes on to its More button.
    act(() => actionNamed(container, "Open Models").focus());
    press(actionNamed(container, "Open Models"), "ArrowRight");
    expect(document.activeElement).toBe(firstMore);
  });
});
