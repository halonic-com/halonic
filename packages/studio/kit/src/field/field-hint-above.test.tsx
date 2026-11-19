// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { RadioGroup } from "../radio/radio-group.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Field } from "./field.tsx";
import { FormRows } from "./form-rows.tsx";

afterEach(() => {
  unmountAll();
});

const HINT = "What drives this agent";

const harnesses = [
  { value: "halonic", label: "Halonic", note: "Built in" },
  { value: "codex", label: "Codex", note: "Not installed" },
];

/** The Harness page's group: a RadioGroup whose options have notes, with the hint above them. */
function harnessField(error: string | null = null) {
  return (
    <Field label="Harness" hint={HINT} error={error} hintAbove>
      <RadioGroup options={harnesses} value="halonic" onChange={vi.fn()} />
    </Field>
  );
}

function describedText(element: Element): string {
  const id = element.getAttribute("aria-describedby") ?? "";
  return document.getElementById(id)?.textContent ?? "";
}

function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

verifies("kit.field-hint-above", () => {
  it("puts the hint after the label and before the group, and keeps it the group's description", () => {
    const { container } = render(harnessField());
    const label = container.querySelector("label") as HTMLLabelElement;
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    const hint = Array.from(container.querySelectorAll("p")).find(
      (line) => line.textContent === HINT,
    ) as HTMLElement;
    expect(follows(label, hint)).toBe(true);
    expect(follows(hint, group)).toBe(true);
    expect(hint.className).toBe("text-caption text-fg-subtle");
    expect(describedText(group)).toBe(HINT);
  });

  it("puts an error in the hint's place, above the group", () => {
    const { container } = render(harnessField("Pick a harness."));
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    const error = container.querySelector("p.text-danger") as HTMLElement;
    expect(error.textContent).toBe("Pick a harness.");
    expect(follows(error, group)).toBe(true);
    expect(container.textContent).not.toContain(HINT);
    expect(describedText(group)).toBe("Pick a harness.");
  });

  it("lines a side label up with the line's text, not a control's", () => {
    const { container } = render(<FormRows>{harnessField()}</FormRows>);
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.className).not.toContain("pt-1.5");
  });

  it("without a hint, lines a side label up with the control as before", () => {
    const { container } = render(
      <FormRows>
        <Field label="Harness" hintAbove>
          <RadioGroup options={harnesses} value="halonic" onChange={vi.fn()} />
        </Field>
      </FormRows>,
    );
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.className).toContain("pt-1.5");
  });
});
