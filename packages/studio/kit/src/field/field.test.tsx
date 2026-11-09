// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Field, type FieldProps, useFieldControl } from "./field.tsx";

afterEach(() => {
  unmountAll();
});

/** A control that wires itself from its Field, as every kit control does. */
function TestControl() {
  const field = useFieldControl();
  return (
    <input
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      aria-required={field?.required || undefined}
    />
  );
}

function renderField(props: Omit<FieldProps, "children">) {
  const { container } = render(
    <Field {...props}>
      <TestControl />
    </Field>,
  );
  const label = container.querySelector("label") as HTMLLabelElement;
  const input = container.querySelector("input") as HTMLInputElement;
  const line = () => {
    const id = input.getAttribute("aria-describedby");
    return id === null ? null : document.getElementById(id);
  };
  return { container, label, input, line };
}

verifies("kit.field", () => {
  it("puts the label above the control and points it at the control", () => {
    const { label, input } = renderField({ label: "Name" });
    expect(input.id).not.toBe("");
    expect(label.htmlFor).toBe(input.id);
    expect(label.textContent).toBe("Name");
    expect(label.className).toContain("text-caption text-fg-muted");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("describes the control with its hint", () => {
    const { input, line } = renderField({ label: "Name", hint: "Shown in the sidebar." });
    expect(line()?.textContent).toBe("Shown in the sidebar.");
    expect(line()?.className).toContain("text-fg-subtle");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("replaces the hint with the error, its icon and aria-invalid", () => {
    const { container, input, line } = renderField({
      label: "Name",
      hint: "Shown in the sidebar.",
      error: "Give the agent a name.",
    });
    expect(container.textContent).not.toContain("Shown in the sidebar.");
    expect(line()?.textContent).toBe("Give the agent a name.");
    expect(line()?.className).toContain("text-danger");
    expect(line()?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("treats an empty error or hint as none", () => {
    for (const empty of [
      { error: "" },
      { error: null },
      { hint: "" },
      { hint: null },
      { hint: false },
    ]) {
      const { container, input } = renderField({ label: "Name", ...empty });
      expect(input.hasAttribute("aria-invalid")).toBe(false);
      expect(input.hasAttribute("aria-describedby")).toBe(false);
      expect(container.querySelector("p")).toBeNull();
      unmountAll();
    }
    const { input, line } = renderField({
      label: "Name",
      hint: "Shown in the sidebar.",
      error: "",
    });
    expect(line()?.textContent).toBe("Shown in the sidebar.");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("writes Required after the label, with no asterisk, and tells the control", () => {
    const { label, input } = renderField({ label: "Name", required: true });
    expect(label.textContent).toBe("Name Required");
    expect(label.textContent).not.toContain("*");
    expect(label.querySelector("span")?.className).toBe("text-fg-subtle");
    expect(input.getAttribute("aria-required")).toBe("true");
  });

  it("names the control without the visible Required, so it isn't heard twice", () => {
    const { label } = renderField({ label: "Name", required: true });
    const required = label.querySelector("span") as HTMLElement;
    expect(required.getAttribute("aria-hidden")).toBe("true");
    const spoken = Array.from(label.childNodes)
      .filter((node) => !(node instanceof Element && node.getAttribute("aria-hidden") === "true"))
      .map((node) => node.textContent)
      .join("");
    expect(spoken).toBe("Name");
  });

  it("hides the label from sight only, for a search in a toolbar", () => {
    const { label } = renderField({ label: "Search agents", hideLabel: true });
    expect(label.className).toBe("sr-only");
    expect(label.textContent).toBe("Search agents");
  });

  it("gives each control its own id", () => {
    const { container } = render(
      <>
        <Field label="Name">
          <TestControl />
        </Field>
        <Field label="Description">
          <TestControl />
        </Field>
      </>,
    );
    const [first, second] = Array.from(container.querySelectorAll("input"));
    expect(first?.id).not.toBe(second?.id);
  });

  it("tells a control outside a Field that it has none", () => {
    const { container } = render(<TestControl />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.id).toBe("");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});
