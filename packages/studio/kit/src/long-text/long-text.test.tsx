// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { buttonNamed, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { LongText, type LongTextProps } from "./long-text.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

function Instructions({ error, ...props }: Partial<LongTextProps> & { readonly error?: string }) {
  const [value, setValue] = useState(props.value ?? "Sort the inbox.");
  return (
    <Field label="Instructions" hint="What the agent does." error={error ?? null}>
      <LongText
        value={value}
        placeholder="Add instructions"
        onChange={(next) => {
          setValue(next);
          props.onChange?.(next);
        }}
        {...(props.onSheetDone === undefined ? {} : { onSheetDone: props.onSheetDone })}
      />
    </Field>
  );
}

function onPhone(element: ReactNode) {
  return <PresentationProvider presentation="phone">{element}</PresentationProvider>;
}

function folded(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
}

function described(element: Element): string[] {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "");
}

verifies("kit.long-text", () => {
  it("is the kit's TextArea on desktop", () => {
    const { container } = render(<Instructions />);
    expect(container.querySelector("textarea")?.value).toBe("Sort the inbox.");
    expect(folded(container)).toBeNull();
  });

  it("on a phone is a button named by the label and described by the text, not an input", () => {
    const { container } = render(onPhone(<Instructions />));
    expect(container.querySelector("textarea, input")).toBeNull();
    const button = folded(container);
    expect(button.getAttribute("type")).toBe("button");
    expect(document.getElementById(button.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Instructions",
    );
    expect(described(button)).toEqual(["Sort the inbox.", "What the agent does."]);
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(button.id);
  });

  it("looks like the phone Input: the box's edge, 12px, 16px text folded after 8 lines", () => {
    const { container } = render(onPhone(<Instructions />));
    const box = folded(container).parentElement as HTMLElement;
    expect(box.className).toContain("border-border-control");
    expect(box.className).toContain("phone:min-h-touch phone:px-3");
    expect(box.className).toContain("focus-field");
    expect(box.className).toContain("py-3");
    const text = box.querySelector("span") as HTMLElement;
    expect(text.className).toContain("line-clamp-8");
    expect(text.className).toContain("text-input-touch");
    expect(text.className).toContain("wrap-break-word");
  });

  it("has a 20px chevron in fg-subtle, top-aligned with the first line", () => {
    const { container } = render(onPhone(<Instructions />));
    const chevron = (folded(container).parentElement as HTMLElement).querySelector(
      '[aria-hidden="true"]',
    ) as HTMLElement;
    expect(chevron.className).toContain("mt-0.5");
    expect(chevron.className).toContain("size-icon-md");
    expect(chevron.className).toContain("text-fg-subtle");
  });

  it("shows the placeholder in fg-subtle when empty", () => {
    const { container } = render(onPhone(<Instructions value="" />));
    const text = (folded(container).parentElement as HTMLElement).querySelector(
      "span",
    ) as HTMLElement;
    expect(text.textContent).toBe("Add instructions");
    expect(text.className).toContain("text-fg-subtle");
  });

  it("shows a Field error on the page with a danger edge", () => {
    const { container } = render(onPhone(<Instructions value="" error="Add instructions." />));
    const button = folded(container);
    expect(button.getAttribute("aria-invalid")).toBe("true");
    expect((button.parentElement as HTMLElement).className).toContain("border-danger");
    expect(described(button)).toContain("Add instructions.");
  });

  it("opens the text sheet titled with the label; typing there changes the field", async () => {
    const onChange = vi.fn();
    const { container } = render(onPhone(<Instructions onChange={onChange} />));
    await click(folded(container));
    const sheet = container.querySelector("dialog") as HTMLDialogElement;
    expect(sheet.querySelector("h2")?.textContent).toBe("Instructions");
    expect(sheet.querySelector("p")?.textContent).toBe("What the agent does.");
    const text = sheet.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setValue?.call(text, "Sort the inbox.\nFlag invoices.");
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith("Sort the inbox.\nFlag invoices.");
  });

  it("on Done closes the sheet, hands back the text it opened with and focuses the field", async () => {
    const onSheetDone = vi.fn();
    const { container } = render(onPhone(<Instructions onSheetDone={onSheetDone} />));
    const button = folded(container);
    button.focus();
    await click(button);
    await click(buttonNamed(container, "Done"));
    expect(container.querySelector("dialog")).toBeNull();
    expect(onSheetDone).toHaveBeenCalledExactlyOnceWith("Sort the inbox.");
    expect(document.activeElement).toBe(button);
  });
});
