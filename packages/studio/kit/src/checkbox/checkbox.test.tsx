// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { Checkbox } from "./checkbox.tsx";

afterEach(() => {
  unmountAll();
});

function boxIn(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

verifies("kit.checkbox", () => {
  it("is a native 16px box with a control edge, the focus ring and a hover edge", () => {
    const { container } = render(
      <Checkbox label="Select Sorter" checked={false} onChange={vi.fn()} />,
    );
    const box = boxIn(container);
    expect(box.getAttribute("aria-label")).toBe("Select Sorter");
    expect(box.className).toContain("size-4");
    expect(box.className).toContain("rounded-xs");
    expect(box.className).toContain("appearance-none");
    expect(box.className).toContain("border-border-control");
    expect(box.className).toContain("bg-surface");
    expect(box.className).toContain("focus-ring");
    expect(box.className).toContain("hover:border-fg-muted");
    expect(box.className).toContain("group-hover/checkbox:border-fg-muted");
  });

  it("must have a name: words or a label, never both", () => {
    // @ts-expect-error: neither words nor a label
    const nameless = <Checkbox checked={false} onChange={vi.fn()} />;
    const twice = (
      // @ts-expect-error: both words and a label
      <Checkbox label="Select" checked={false} onChange={vi.fn()}>
        Select
      </Checkbox>
    );
    expect([nameless, twice]).toHaveLength(2);
  });

  it("fills primary with a check when checked, and shows a dash, read as mixed, when indeterminate", () => {
    const { container, rerender } = render(<Checkbox label="All" checked onChange={vi.fn()} />);
    const box = boxIn(container);
    expect(box.checked).toBe(true);
    expect(box.className).toContain("checked:bg-primary");
    // A checked box keeps its primary edge under the pointer.
    expect(box.className).not.toContain("hover:");
    const mark = box.nextElementSibling as HTMLElement;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.className).toContain("text-on-primary");
    expect(mark.className).toContain("peer-checked:grid");
    expect(mark.querySelector("path")?.getAttribute("d")).toContain("l4.5-5.5");

    rerender(<Checkbox label="All" checked={false} indeterminate onChange={vi.fn()} />);
    expect(boxIn(container).indeterminate).toBe(true);
    expect(mark.querySelector("path")?.getAttribute("d")).toBe("M3 6h6");
  });

  it("calls onChange with the new value on a click on the box or its words", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Checkbox checked={false} onChange={onChange}>
        Run on a schedule
      </Checkbox>,
    );
    const label = container.querySelector("label") as HTMLElement;
    expect(label.className).toContain("phone:min-h-touch");
    expect(label.className).toContain("touch:min-h-touch");
    expect(label.className).toContain("group/checkbox");
    await click(label.lastChild?.parentElement as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith(true);
    await click(boxIn(container));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("stays focusable but ignores clicks while unavailable, described by its reason", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <>
        <Checkbox
          label="Select Sorter"
          checked
          onChange={onChange}
          unavailable={{ reason: "why" }}
        />
        <p id="why">Still downloading</p>
      </>,
    );
    const box = boxIn(container);
    expect(box.disabled).toBe(false);
    expect(box.getAttribute("aria-disabled")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe("why");
    expect(box.className).toContain("opacity-45");
    expect(box.className).toContain("contrast-more:opacity-60");
    expect(box.className).toContain("border-fg-disabled");
    act(() => box.focus());
    expect(document.activeElement).toBe(box);
    await click(box);
    expect(onChange).not.toHaveBeenCalled();
    expect(box.checked).toBe(true);
  });

  it("keeps a mixed box mixed and as it was on a click or Space while unavailable", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Checkbox checked indeterminate onChange={onChange} unavailable={{ reason: "why" }}>
        Some rows
      </Checkbox>,
    );
    const box = boxIn(container);
    await click(box);
    // Space on a focused checkbox arrives as a click too.
    await click(container.querySelector("label") as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
    expect(box.checked).toBe(true);
    expect(box.indeterminate).toBe(true);
  });

  it("stays mixed after a click when the screen keeps it mixed", async () => {
    const { container } = render(
      <Checkbox label="All" checked={false} indeterminate onChange={vi.fn()} />,
    );
    const box = boxIn(container);
    await click(box);
    expect(box.checked).toBe(false);
    expect(box.indeterminate).toBe(true);
  });

  it("takes a Field's error: a danger edge, aria-invalid and the error line", () => {
    const { container } = render(
      <Field label="Terms" error="Agree to the terms to go on.">
        <Checkbox checked={false} onChange={vi.fn()}>
          I agree
        </Checkbox>
      </Field>,
    );
    const box = boxIn(container);
    expect(box.className).toContain("border-danger");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    const line = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("Agree to the terms to go on.");
  });

  it("is named by its own words in a Field, and by the Field's label without them", () => {
    const { container } = render(
      <>
        <Field label="Terms">
          <Checkbox checked={false} onChange={vi.fn()}>
            I agree
          </Checkbox>
        </Field>
        <Field label="Sorter">
          <Checkbox label="Select Sorter" checked={false} onChange={vi.fn()} />
        </Field>
      </>,
    );
    const [withWords, withoutWords] = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(withWords?.id).toBe("");
    expect(withWords?.labels).toHaveLength(1);
    expect(withWords?.labels?.[0]?.textContent).toBe("I agree");
    expect(withoutWords?.labels?.[0]?.textContent).toBe("Sorter");
  });

  it("fills Highlight when checked in high contrast", () => {
    const { container } = render(<Checkbox label="All" checked onChange={vi.fn()} />);
    expect(boxIn(container).className).toContain("checkbox-forced");
  });
});
