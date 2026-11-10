// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { FilterChips } from "./filter-chips.tsx";

afterEach(() => {
  unmountAll();
});

const hubs = [
  { value: "all", label: "All" },
  { value: "acme", label: "acme" },
  { value: "beta", label: "beta" },
] as const;

function radios(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

verifies("kit.filter-chips", () => {
  it("lays out a wrapping row: 8px between chips, 16px between lines, padding 8px 16px", () => {
    const { container } = render(
      <FilterChips label="Hub" options={hubs} value="all" onChange={() => undefined} />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("flex flex-wrap gap-x-2 gap-y-4 px-4 py-2");
    expect(row.className).not.toContain("overflow-x");
  });

  it("makes one-of chips a radio group of native radios named by their words", () => {
    const { container } = render(
      <FilterChips label="Hub" options={hubs} value="acme" onChange={() => undefined} />,
    );
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute("aria-label")).toBe("Hub");
    const [all, acme, beta] = radios(container) as [
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
    ];
    expect(acme.checked).toBe(true);
    expect(all.checked).toBe(false);
    expect(all.name).toBe(beta.name);
    expect((acme.closest("label") as HTMLElement).textContent).toBe("acme");
  });

  it("draws an off chip as a surface pill with a border-control edge in fg-muted", () => {
    const { container } = render(
      <FilterChips label="Hub" options={hubs} value="acme" onChange={() => undefined} />,
    );
    const all = radios(container)[0] as HTMLInputElement;
    expect(all.className).toContain("rounded-full border");
    expect(all.className).toContain("border-border-control bg-surface");
    expect(all.className).toContain("hover:bg-surface-subtle");
    expect(all.className).toContain("focus-ring");
    const label = all.closest("label") as HTMLElement;
    expect(label.className).toContain("px-3 text-fg-muted");
    expect(label.querySelector("svg")).toBeNull();
  });

  it("draws an on chip in accent-soft and accent-text at 500 with a 12px check, 8px in", () => {
    const { container } = render(
      <FilterChips label="Hub" options={hubs} value="acme" onChange={() => undefined} />,
    );
    const acme = radios(container)[1] as HTMLInputElement;
    expect(acme.className).toContain("border-transparent bg-accent-soft");
    expect(acme.className).toContain("contrast-more:border-accent-text");
    const label = acme.closest("label") as HTMLElement;
    expect(label.className).toContain("pr-3 pl-2 font-medium text-accent-text");
    const check = label.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(check.className).toContain("size-3");
    expect(check.querySelector("svg")).not.toBeNull();
  });

  it("is 28px on desktop and 32px with a 48px hit area on a phone or a touch screen", () => {
    const { container } = render(
      <FilterChips label="Hub" options={hubs} value="all" onChange={() => undefined} />,
    );
    const label = radios(container)[0]?.closest("label") as HTMLElement;
    expect(label.className).toContain("min-h-control-sm");
    expect(label.className).toContain(
      "phone:min-h-8 phone:hit-touch touch:min-h-8 touch:hit-touch",
    );
    expect(label.className).toContain("text-small");
  });

  it("calls onChange with the chip the user picks, and shows the value it's given", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <FilterChips label="Hub" options={hubs} value="all" onChange={onChange} />,
    );
    await click(radios(container)[2] as HTMLInputElement);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("beta");
    expect((radios(container)[0] as HTMLInputElement).checked).toBe(true);
  });

  it("makes on/off chips toggle buttons with aria-pressed in a named group", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <FilterChips label="Filters" toggles={[{ label: "Test runs", pressed: false, onChange }]} />,
    );
    expect(container.querySelector("fieldset")?.getAttribute("aria-label")).toBe("Filters");
    const chip = container.querySelector("button") as HTMLButtonElement;
    expect(chip.getAttribute("type")).toBe("button");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.className).toContain("border-border-control bg-surface");
    await click(chip);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);

    rerender(
      <FilterChips label="Filters" toggles={[{ label: "Test runs", pressed: true, onChange }]} />,
    );
    const on = container.querySelector("button") as HTMLButtonElement;
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.className).toContain("bg-accent-soft");
    expect(on.querySelector("svg")).not.toBeNull();
    expect(on.textContent).toBe("Test runs");
  });

  it("keeps an unavailable toggle focusable, ignores presses and points at its reason", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <>
        <FilterChips
          label="Filters"
          toggles={[
            { label: "Test runs", pressed: false, onChange, unavailable: { reason: "why" } },
          ]}
        />
        <p id="why">No test runs yet.</p>
      </>,
    );
    const chip = container.querySelector("button") as HTMLButtonElement;
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(chip.hasAttribute("disabled")).toBe(false);
    expect(chip.getAttribute("aria-describedby")).toBe("why");
    expect(chip.className).toContain("aria-disabled:text-fg-disabled");
    await click(chip);
    expect(onChange).not.toHaveBeenCalled();
  });
});
