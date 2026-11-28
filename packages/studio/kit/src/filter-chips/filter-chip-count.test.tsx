// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { FilterChips, type FilterOneOfOption } from "./filter-chips.tsx";

afterEach(() => {
  unmountAll();
});

const kinds: readonly FilterOneOfOption[] = [
  { value: "skill", label: "Skills" },
  {
    value: "connector",
    label: "Connectors",
    count: { value: 1, tone: "danger", name: "1 problem" },
  },
  { value: "unread", label: "Unread", count: { value: 2, name: "2 unread" } },
];

function renderRow(value: string): HTMLElement {
  return render(
    <FilterChips label="Library" options={kinds} value={value} onChange={() => undefined} />,
  ).container;
}

function chip(container: HTMLElement, value: string): HTMLLabelElement {
  const radio = container.querySelector(`input[value="${value}"]`);
  const label = radio?.closest("label");
  if (!(label instanceof HTMLLabelElement)) throw new Error(`no chip for ${value}`);
  return label;
}

function countChip(label: HTMLLabelElement): HTMLElement {
  const count = label.querySelector(".sr-only")?.parentElement;
  if (!(count instanceof HTMLElement)) throw new Error("no count chip");
  return count;
}

verifies("kit.filter-chip-count", () => {
  it("shows the number hidden from screen readers, who hear the count's name after the label", () => {
    const connectors = chip(renderRow("skill"), "connector");
    expect(connectors.textContent).toBe("Connectors1, 1 problem");
    expect(connectors.querySelector('[aria-hidden="true"]')?.textContent).toBe("1");
    expect(connectors.querySelector(".sr-only")?.textContent).toBe(", 1 problem");
  });

  it("shows the count in its tone, and accent when it has none", () => {
    const container = renderRow("skill");
    expect(countChip(chip(container, "connector")).className).toContain("text-danger");
    expect(countChip(chip(container, "unread")).className).toContain("text-accent-text");
  });

  it("lays the count over surface as one opaque box while the chip is on or filled on hover", () => {
    const container = renderRow("connector");
    const on = chip(container, "connector");
    expect(on.getAttribute("data-fill")).toBe("muted");
    expect(countChip(on).className).toContain("on-muted:bg-over-surface-danger-soft");
    const off = chip(container, "unread");
    expect(off.getAttribute("data-fill")).toBeNull();
    expect(off.getAttribute("data-hover-fill")).toBe("muted");
  });

  it("shows only the label without a count", () => {
    const skills = chip(renderRow("skill"), "skill");
    expect(skills.querySelector(".sr-only")).toBeNull();
    expect(skills.textContent).toBe("Skills");
  });
});
