// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";
import { render, unmountAll } from "../test/render.tsx";
import { Field, type FieldProps, useFieldControl } from "./field.tsx";
import { FormRows } from "./form-rows.tsx";

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
    />
  );
}

type RowProps = Omit<FieldProps, "children" | "label">;

/** One Field in `FormRows`, or alone when `rows` is false. Returns its parts. */
function renderRow(props: RowProps, { rows = true, inCard = false } = {}) {
  const field = (
    <Field label="Name" {...props}>
      <TestControl />
    </Field>
  );
  const { container } = render(rows ? <FormRows inCard={inCard}>{field}</FormRows> : field);
  const label = container.querySelector("label") as HTMLLabelElement;
  const input = container.querySelector("input") as HTMLInputElement;
  // The row is the label's parent; the value column holds the control and its line.
  const row = label.parentElement as HTMLElement;
  const value = input.parentElement as HTMLElement;
  const line = () => document.getElementById(input.getAttribute("aria-describedby") ?? "");
  return { container, label, input, row, value, line };
}

verifies("kit.form-rows", () => {
  it("lays every Field inside FormRows out side by side, without the prop", () => {
    const { container, label, row, value } = renderRow({});
    expect(row.parentElement?.className).toBe("@container");
    expect(row.className).toContain("@min-[46.5rem]:flex-row @min-[46.5rem]:gap-4");
    expect(label.className).toContain("@min-[46.5rem]:w-42");
    expect(label.className).toContain("@min-[46.5rem]:text-small @min-[46.5rem]:font-medium");
    expect(label.className).toContain("text-fg-muted");
    expect(value.className).toContain("@min-[46.5rem]:max-w-140");
    expect(value.parentElement).toBe(row);
    expect(container.querySelector(":scope > div")?.className).toBe(
      "flex flex-col divide-y divide-border *:py-4",
    );
  });

  it("falls back to label over value, as a Field is today, below the container query", () => {
    const { row, label } = renderRow({});
    // Without the query's variant, the row is the stacked Field's column and caption label.
    expect(row.className.split(" ").filter((name) => !name.startsWith("@"))).toEqual([
      "flex",
      "flex-col",
      "gap-1",
    ]);
    expect(label.className.split(" ").filter((name) => !name.startsWith("@"))).toEqual([
      "text-caption",
      "text-fg-muted",
    ]);
  });

  it("moves the label 6px down to a control's text line, but not with align text", () => {
    expect(renderRow({}).label.className).toContain("@min-[46.5rem]:pt-1.5");
    unmountAll();
    expect(renderRow({ align: "text" }).label.className).not.toContain("pt-1.5");
  });

  it("drops the value column's 560px limit when wide", () => {
    expect(renderRow({ wide: true }).value.className).not.toContain("max-w-140");
  });

  it("takes the side layout by itself with layout side, and a Field in FormRows can stack", () => {
    const alone = renderRow({ layout: "side" }, { rows: false });
    expect(alone.row.className).toContain("@min-[46.5rem]:flex-row");
    unmountAll();
    const stacked = renderRow({ layout: "stack" });
    expect(stacked.row.className).toBe("flex flex-col gap-1");
    unmountAll();
    const plain = renderRow({}, { rows: false });
    expect(plain.row.className).toBe("flex flex-col gap-1");
  });

  it("puts the hint and the error under the value and links them in both layouts", () => {
    for (const layout of ["side", "stack"] as const) {
      const hinted = renderRow({ layout, hint: "Shown in the sidebar." });
      expect(hinted.line()?.textContent).toBe("Shown in the sidebar.");
      expect(hinted.line()?.parentElement).toBe(hinted.value);
      unmountAll();
      const failed = renderRow({ layout, error: "Give the skill a name." });
      expect(failed.line()?.textContent).toBe("Give the skill a name.");
      expect(failed.line()?.parentElement).toBe(failed.value);
      expect(failed.input.getAttribute("aria-invalid")).toBe("true");
      // The error doesn't colour the label or the row.
      expect(failed.label.className).not.toContain("danger");
      expect(failed.row.className).not.toContain("danger");
      unmountAll();
    }
  });

  it("uses a 120px label, a 12px gap, 12px between rows and no dividers inside a Card", () => {
    const { container, label, row, value } = renderRow({}, { inCard: true });
    expect(container.querySelector(":scope > div")?.className).toBe("flex flex-col gap-3");
    expect(row.className).toContain("@min-[28rem]:flex-row @min-[28rem]:gap-3");
    expect(label.className).toContain("@min-[28rem]:w-30");
    expect(value.className).not.toContain("max-w");
  });

  it("keeps the label pointing at the control and writes Required in the side layout", () => {
    const { label, input } = renderRow({ required: true });
    expect(label.htmlFor).toBe(input.id);
    expect(label.textContent).toBe("Name Required");
  });
});

describe("FormRows built by Tailwind", () => {
  it("writes the container queries in rem, and the sizes from the 4px spacing", async () => {
    const css = await buildCss([
      "@container",
      "@min-[46.5rem]:flex-row",
      "@min-[28rem]:flex-row",
      "w-42",
      "w-30",
      "max-w-140",
    ]);
    expect(css).toMatch(/\.\\@container \{\s*container-type: inline-size;/);
    expect(css).toContain("@container (width >= 46.5rem)");
    expect(css).toContain("@container (width >= 28rem)");
    expect(css).toMatch(/\.w-42 \{\s*width: calc\(var\(--spacing\) \* 42\);/);
    expect(css).toMatch(/\.max-w-140 \{\s*max-width: calc\(var\(--spacing\) \* 140\);/);
  });
});
