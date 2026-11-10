// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buttonNamed, dialogOf, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { PICKER_SEARCH_FROM, type PickerOption, PickerSheet } from "./picker-sheet.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

const models: readonly PickerOption[] = [
  { value: "sonnet", label: "Sonnet", description: "€3 per million words in" },
  { value: "haiku", label: "Haiku" },
  { value: "opus", label: "Opus", unavailable: { reason: "Needs an Anthropic key." } },
];

function radios(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

function radioNamed(container: HTMLElement, name: string): HTMLInputElement {
  const radio = radios(container).find(
    (candidate) =>
      document.getElementById(candidate.getAttribute("aria-labelledby") ?? "")?.textContent ===
      name,
  );
  if (radio === undefined) {
    throw new Error(`No radio named ${name}`);
  }
  return radio;
}

function key(element: Element, name: string): void {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  });
}

function picker(overrides: Partial<Parameters<typeof PickerSheet>[0]> = {}) {
  return (
    <PickerSheet
      title="Model"
      options={models}
      value="sonnet"
      empty="No models yet. Add a provider in Settings."
      onPick={() => undefined}
      onClose={() => undefined}
      {...overrides}
    />
  );
}

verifies("kit.picker-sheet", () => {
  it("fills the screen with no radius, shadow or overlay, as high as the shell's column", () => {
    const { container } = render(picker());
    const sheet = dialogOf(container);
    expect(sheet.open).toBe(true);
    expect(sheet.className).toContain("h-(--app-height,100dvh)");
    expect(sheet.className).toContain("w-full max-w-none");
    expect(sheet.className).toContain("rounded-none border-0 bg-surface");
    expect(sheet.className).toContain("backdrop:bg-transparent");
    expect(sheet.className).not.toMatch(/shadow-/);
  });

  it("puts Close at the top left and the field's label as the title, which takes focus", () => {
    const { container } = render(picker());
    const bar = container.querySelector("header") as HTMLElement;
    expect(bar.className).toContain("min-h-phone-bar");
    expect(bar.className).toContain("pt-safe");
    const close = bar.firstElementChild as HTMLButtonElement;
    expect(close.getAttribute("aria-label")).toBe("Close");
    const title = bar.querySelector("h2") as HTMLElement;
    expect(title.textContent).toBe("Model");
    expect(document.activeElement).toBe(title);
    expect(dialogOf(container).getAttribute("aria-labelledby")).toBe(title.id);
  });

  it("lists the options as native radios in one group, the current one checked with the check", () => {
    const { container } = render(picker());
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Model",
    );
    const [sonnet, haiku] = radios(container) as [HTMLInputElement, HTMLInputElement];
    expect(sonnet.checked).toBe(true);
    expect(haiku.checked).toBe(false);
    expect(sonnet.name).toBe(haiku.name);
    const checkedRow = sonnet.parentElement as HTMLElement;
    expect(checkedRow.querySelector(".text-accent svg")).not.toBeNull();
    expect((haiku.parentElement as HTMLElement).querySelector(".text-accent")).toBeNull();
  });

  it("draws 56px rows with a description and 48px rows without, padded 8px 16px", () => {
    const { container } = render(picker());
    const sonnet = radioNamed(container, "Sonnet");
    const haiku = radioNamed(container, "Haiku");
    expect((sonnet.parentElement as HTMLElement).className).toContain("min-h-14");
    expect((sonnet.parentElement as HTMLElement).className).toContain("px-4 py-2");
    expect((haiku.parentElement as HTMLElement).className).toContain("min-h-touch");
    expect(
      document.getElementById(sonnet.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("€3 per million words in");
  });

  it("picks on a tap and leaves closing to the screen", async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { container } = render(picker({ onPick, onClose }));
    await click(radioNamed(container, "Haiku"));
    expect(onPick).toHaveBeenCalledExactlyOnceWith("haiku");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("picks the focused option on Enter or Space, even the one already picked", () => {
    const onPick = vi.fn();
    const { container } = render(picker({ onPick }));
    key(radioNamed(container, "Sonnet"), "Enter");
    expect(onPick).toHaveBeenCalledExactlyOnceWith("sonnet");

    unmountAll();
    const second = vi.fn();
    const again = render(picker({ onPick: second }));
    key(radioNamed(again.container, "Haiku"), " ");
    expect(second).toHaveBeenCalledExactlyOnceWith("haiku");
  });

  it("moves the check with the arrow keys without picking, though the radio fires click", async () => {
    const onPick = vi.fn();
    const { container } = render(picker({ onPick }));
    const sonnet = radioNamed(container, "Sonnet");
    const haiku = radioNamed(container, "Haiku");
    // What a browser does on ArrowDown: keydown on the focused radio, then a click on the next.
    key(sonnet, "ArrowDown");
    await click(haiku);
    expect(onPick).not.toHaveBeenCalled();
    expect(haiku.checked).toBe(true);
    expect((haiku.parentElement as HTMLElement).querySelector(".text-accent")).not.toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve));
    });
    key(haiku, "Enter");
    expect(onPick).toHaveBeenCalledExactlyOnceWith("haiku");
  });

  it("closes without picking on Close and on Escape, so the field keeps its value", async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { container } = render(picker({ onPick, onClose }));
    await click(buttonNamed(container, "Close"));
    act(() => {
      dialogOf(container).dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("lists an unavailable option, disabled, with its reason as the description", async () => {
    const onPick = vi.fn();
    const { container } = render(picker({ onPick }));
    const opus = radioNamed(container, "Opus");
    expect(opus.disabled).toBe(true);
    expect(document.getElementById(opus.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Needs an Anthropic key.",
    );
    key(opus, "Enter");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("shows the explanation line above the options", () => {
    const { container } = render(picker({ explanation: "Only models that Claude Code can use." }));
    const line = [...container.querySelectorAll("p")].find(
      (paragraph) => paragraph.textContent === "Only models that Claude Code can use.",
    );
    expect(line?.className).toContain("text-small text-fg-muted");
  });

  it("says what's missing when there are no options", () => {
    const { container } = render(picker({ options: [], value: undefined }));
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    const line = container.querySelector("p") as HTMLElement;
    expect(line.textContent).toBe("No models yet. Add a provider in Settings.");
    expect(line.className).toContain("text-body text-fg-muted");
  });

  it("adds a search field only from 11 options, which narrows the list by name", () => {
    const ten = Array.from({ length: PICKER_SEARCH_FROM - 1 }, (_, index) => ({
      value: `hub-${index}`,
      label: `Hub ${index}`,
    }));
    const short = render(picker({ options: ten, value: undefined }));
    expect(short.container.querySelector('input[type="search"]')).toBeNull();
    unmountAll();

    const eleven = [...ten, { value: "acme", label: "Acme" }];
    const { container } = render(picker({ options: eleven, value: undefined }));
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(search.getAttribute("aria-label")).toBe("Search Model");
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(search, "acm");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(radios(container)).toHaveLength(1);
  });
});
