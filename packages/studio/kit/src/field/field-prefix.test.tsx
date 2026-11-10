// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { Input } from "../input/input.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { Field, type FieldProps } from "./field.tsx";

afterEach(() => {
  unmountAll();
});

const euros = { symbol: "€", name: "in euros" };

function renderPrefixed(props: Omit<FieldProps, "children" | "prefix">) {
  const { container } = render(
    <Field {...props} prefix={euros}>
      <Input defaultValue="5,00" />
    </Field>,
  );
  const label = container.querySelector("label") as HTMLLabelElement;
  const input = container.querySelector("input") as HTMLInputElement;
  const symbol = Array.from(container.querySelectorAll("span")).find(
    (span) => span.textContent === "€",
  ) as HTMLElement;
  return { container, label, input, symbol };
}

/** What a screen reader says for an element: its text without the parts hidden from it. */
function spokenText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return copy.textContent ?? "";
}

verifies("kit.field-prefix", () => {
  it("shows the symbol in text-body fg-muted, 8px before the box and centred on it", () => {
    const { input, symbol } = renderPrefixed({ label: "Per run" });
    expect(symbol.className).toContain("text-body text-fg-muted");
    const row = symbol.parentElement as HTMLElement;
    expect(row.className).toBe("flex items-center gap-2");
    expect(row.contains(input)).toBe(true);
    // The box takes the rest of the row.
    expect(symbol.nextElementSibling?.className).toBe("min-w-0 flex-1");
  });

  it("hides the symbol and adds its name to the label, so the control is read 'Per run, in euros'", () => {
    const { label, input, symbol } = renderPrefixed({ label: "Per run" });
    expect(symbol.getAttribute("aria-hidden")).toBe("true");
    expect(label.htmlFor).toBe(input.id);
    expect(spokenText(label)).toBe("Per run, in euros");
    const name = label.querySelector(".sr-only") as HTMLElement;
    expect(name.textContent).toBe(", in euros");
  });

  it("keeps the name before the hidden Required", () => {
    const { label } = renderPrefixed({ label: "Per run", required: true });
    expect(spokenText(label)).toBe("Per run, in euros");
    expect(label.textContent).toBe("Per run, in euros Required");
  });

  it("focuses the control when the symbol is tapped", async () => {
    const { input, symbol } = renderPrefixed({ label: "Per run" });
    await click(symbol);
    expect(document.activeElement).toBe(input);
  });

  it("starts the hint and the error at the Field's left edge, under the symbol", () => {
    const hinted = renderPrefixed({ label: "Per run", hint: "Most you will spend on one run." });
    const hint = hinted.container.querySelector("p") as HTMLElement;
    const row = hinted.symbol.parentElement as HTMLElement;
    expect(hint.textContent).toBe("Most you will spend on one run.");
    expect(hint.parentElement).toBe(row.parentElement);
    expect(hinted.input.getAttribute("aria-describedby")).toBe(hint.id);

    const failed = renderPrefixed({ label: "Per month", error: "Enter an amount above 0." });
    const error = failed.container.querySelector("p") as HTMLElement;
    expect(error.parentElement).toBe((failed.symbol.parentElement as HTMLElement).parentElement);
    expect(failed.input.getAttribute("aria-invalid")).toBe("true");
  });

  it("leaves a Field without a prefix as it was", () => {
    const { container } = render(
      <Field label="Name">
        <Input />
      </Field>,
    );
    expect(container.querySelector(".sr-only")).toBeNull();
    // The label, then the Input's own box straight under the Field: no row round it.
    const field = container.firstElementChild as HTMLElement;
    expect(field.children).toHaveLength(2);
    expect(field.lastElementChild?.contains(container.querySelector("input"))).toBe(true);
    expect(field.lastElementChild?.getAttribute("class")).not.toBe("flex items-center gap-2");
  });
});
