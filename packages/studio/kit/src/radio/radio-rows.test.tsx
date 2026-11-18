// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { RadioGroup, type RadioOption } from "./radio-group.tsx";

afterEach(() => {
  unmountAll();
});

const computers: readonly RadioOption[] = [
  { value: "laptop", label: "Tim's laptop", note: "Tailscale" },
  { value: "studio", label: "Studio PC", note: "This Wi-Fi", field: <input aria-label="Name" /> },
];

function rows(value: string | null, onChange = vi.fn()) {
  return (
    <RadioGroup
      label="Computer"
      layout="rows"
      options={computers}
      value={value}
      onChange={onChange}
    />
  );
}

verifies("kit.radio-rows", () => {
  it("puts the options as rows in one bordered box, with a line between them", () => {
    const { container } = render(rows("laptop"));
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.className).toContain("rounded-md border border-border bg-surface");
    const [first, second] = Array.from(group.children) as HTMLElement[];
    expect(first?.className).toContain("border-t border-border first:border-t-0");
    expect(second?.className).toContain("border-t border-border");
    const row = first?.querySelector("label") as HTMLElement;
    expect(row.className).toContain("min-h-14 items-center gap-3 px-4 py-3");
    expect(row.className).toContain("touch:min-h-16 phone:min-h-16");
    const radios = group.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios[0]?.checked).toBe(true);
    expect(radios[0]?.className).not.toContain("mt-0.5");
  });

  it("calls onChange from a click anywhere on a row, and shows the picked field in its row", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(rows("laptop", onChange));
    await click(container.querySelectorAll("label")[1] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("studio");
    rerender(rows("studio", onChange));
    const field = container.querySelector('input[aria-label="Name"]')?.parentElement;
    expect(field?.className).toBe("pr-4 pb-3 pl-11");
  });
});
