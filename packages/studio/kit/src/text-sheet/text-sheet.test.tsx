// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buttonNamed, dialogOf, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { TextSheet, type TextSheetProps } from "./text-sheet.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

function sheet(overrides: Partial<TextSheetProps> = {}) {
  return (
    <TextSheet
      title="Instructions"
      value="Sort the inbox."
      onChange={() => undefined}
      onDone={() => undefined}
      {...overrides}
    />
  );
}

function textOf(container: HTMLElement): HTMLTextAreaElement {
  return container.querySelector("textarea") as HTMLTextAreaElement;
}

function described(element: Element): string[] {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "");
}

function type(textarea: HTMLTextAreaElement, value: string): void {
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("kit.text-sheet", () => {
  it("has the field's label as its title 16px in, Done at the right and no Close", () => {
    const { container } = render(sheet());
    const bar = container.querySelector("header") as HTMLElement;
    const title = bar.querySelector("h2") as HTMLElement;
    expect(title.textContent).toBe("Instructions");
    expect(title.className).toContain("pl-3");
    const buttons = [...bar.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Done"]);
    const done = buttons[0] as HTMLButtonElement;
    expect(done.className).toContain("bg-primary");
    expect(done.className).toContain("min-h-control-lg");
    expect((done.parentElement as HTMLElement).className).toContain("pr-3");
    expect(dialogOf(container).open).toBe(true);
  });

  it("fills the rest with one borderless textarea of 16px text, at least 3 lines high", () => {
    const { container } = render(sheet());
    const text = textOf(container);
    expect(text.value).toBe("Sort the inbox.");
    expect(text.getAttribute("aria-label")).toBe("Instructions");
    expect(text.className).toContain("min-h-24 w-full flex-1");
    expect(text.className).toContain("border-0 bg-transparent px-4 py-3 text-input-touch");
    expect(text.hasAttribute("data-text-entry")).toBe(true);
  });

  it("saves as you type: every change goes to onChange", () => {
    const onChange = vi.fn();
    const { container } = render(sheet({ onChange }));
    type(textOf(container), "Sort the inbox.\nFlag invoices.");
    expect(onChange).toHaveBeenLastCalledWith("Sort the inbox.\nFlag invoices.");
  });

  it("shows the hint at the top in text-small fg-muted and describes the text with it", () => {
    const { container } = render(sheet({ hint: "What the agent does, in your words." }));
    const hint = container.querySelector("p") as HTMLElement;
    expect(hint.textContent).toBe("What the agent does, in your words.");
    expect(hint.className).toContain("text-small text-fg-muted");
    expect(described(textOf(container))).toEqual(["What the agent does, in your words."]);
  });

  it("closes on Done and on Android back (cancel)", async () => {
    const onDone = vi.fn();
    const { container } = render(sheet({ onDone }));
    await click(buttonNamed(container, "Done"));
    act(() => {
      dialogOf(container).dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it("with an error, shows it under the hint, and Done and back move focus into the text", async () => {
    const onDone = vi.fn();
    const { container } = render(
      sheet({ onDone, value: "", hint: "Shown on the agent's card.", error: "Add a description." }),
    );
    const text = textOf(container);
    expect(text.getAttribute("aria-invalid")).toBe("true");
    expect(described(text)).toEqual(["Shown on the agent's card.", "Add a description."]);
    const error = [...container.querySelectorAll("p")].find(
      (line) => line.textContent === "Add a description.",
    ) as HTMLElement;
    expect(error.className).toContain("text-danger");
    await click(buttonNamed(container, "Done"));
    expect(document.activeElement).toBe(text);
    (document.activeElement as HTMLElement).blur();
    act(() => {
      dialogOf(container).dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(document.activeElement).toBe(text);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows a failed save as a danger Callout in the alert slot above the text, and Done closes", async () => {
    const onDone = vi.fn();
    const { container } = render(sheet({ onDone, saveError: "Couldn't save. Try again." }));
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const slot = container.querySelector('[role="alert"]') as HTMLElement;
    expect(slot.textContent).toContain("Couldn't save. Try again.");
    expect(slot.compareDocumentPosition(textOf(container))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await click(buttonNamed(container, "Done"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
