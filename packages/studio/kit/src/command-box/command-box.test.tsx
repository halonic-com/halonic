// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClipboardProvider } from "../copy-button/clipboard.tsx";
import { Dialog } from "../dialog/dialog.tsx";
import { fakeClipboard, restoreClipboard } from "../test/clipboard.ts";
import { fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { ToastStoreProvider } from "../toast/toast-provider.tsx";
import { createToastStore, type ToastStore } from "../toast/toast-store.ts";
import { COMMAND_COPIED, COMMAND_NOT_COPIED, CommandBox } from "./command-box.tsx";

const command = "halonic trust ~/work/acme";

beforeEach(() => {
  fakeDialogPage();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  restoreClipboard();
  window.getSelection()?.removeAllRanges();
  vi.useRealTimers();
});

function withToasts(store: ToastStore, children: ReactNode) {
  return <ToastStoreProvider store={store}>{children}</ToastStoreProvider>;
}

/** Trust's dialog, with the command to run. */
function trustDialog(): ReactNode {
  return (
    <Dialog
      title="Trust this workspace?"
      confirm={{ label: "Done", busyLabel: "Saving…" }}
      onConfirm={() => undefined}
      onCancel={() => undefined}
    >
      <CommandBox command={command} />
    </Dialog>
  );
}

function parts(container: HTMLElement) {
  return {
    text: container.querySelector("code") as HTMLElement,
    button: container.querySelector('button[aria-label="Copy command"]') as HTMLButtonElement,
  };
}

/** The Dialog's own polite region, after its next frame. */
function politeText(container: HTMLElement): string {
  act(() => vi.advanceTimersToNextFrame());
  const region = container.querySelector('dialog > [aria-live="polite"]') as HTMLElement;
  return region.textContent ?? "";
}

verifies("kit.command-box", () => {
  it("shows the command in mono on the muted fill, wrapping and selectable at once", () => {
    const { container } = render(<CommandBox command={command} />);
    const { text } = parts(container);
    expect(text.textContent).toBe(command);
    for (const name of [
      "font-mono",
      "text-small",
      "bg-surface-muted",
      "rounded-xs",
      "px-2",
      "py-1.5",
      "select-all",
    ]) {
      expect(text.className.split(" ")).toContain(name);
    }
    expect(text.className).not.toContain("overflow-x");
  });

  it("breaks the command only between shell words, so a flag like --filter stays whole", () => {
    const filtered = "pnpm --filter @halonicjs/studio-kit  test";
    const { container } = render(<CommandBox command={filtered} />);
    const { text } = parts(container);
    // Each word is an inline block, so a line can break only at the spaces between them, never
    // after the hyphens of "--filter"; the spaces stay as they are, so the text is the command.
    const words = [...text.querySelectorAll("span")];
    expect(words.map((word) => word.textContent)).toEqual([
      "pnpm",
      "--filter",
      "@halonicjs/studio-kit",
      "test",
    ]);
    for (const word of words) {
      expect(word.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full"]),
      );
    }
    expect(text.textContent).toBe(filtered);
    expect(text.className.split(" ")).not.toContain("wrap-anywhere");
    expect(text.className.split(" ")).not.toContain("break-all");
  });

  it("breaks inside a word only when that word is wider than the whole box", () => {
    const { container } = render(<CommandBox command={command} />);
    const words = [...parts(container).text.querySelectorAll("span")];
    // Held to the box's width, a word too long for it wraps anywhere instead of scrolling.
    for (const word of words) {
      expect(word.className.split(" ")).toContain("wrap-anywhere");
    }
  });

  it("keeps 192px for the command beside Copy, so a narrow box puts Copy under it", () => {
    const { container } = render(<CommandBox command={command} />);
    const row = container.firstElementChild as HTMLElement;
    const classes = parts(container).text.className.split(" ");
    // The row wraps, and the command's 192px basis (not flex-1's 0) is what makes it wrap.
    expect(row.className.split(" ")).toContain("flex-wrap");
    expect(classes).toEqual(expect.arrayContaining(["grow", "basis-48", "min-w-0"]));
    expect(classes).not.toContain("flex-1");
  });

  it("names its icon button 'Copy command' and keeps the name after copying", async () => {
    fakeClipboard("works");
    const { container } = render(<CommandBox command={command} />);
    const { button } = parts(container);
    expect(button.textContent).toBe("");
    await click(button);
    expect(button.getAttribute("aria-label")).toBe("Copy command");
  });

  it("copies the command and confirms with a 'Copied' toast", async () => {
    const clipboard = fakeClipboard("works");
    const store = createToastStore();
    const { container } = render(withToasts(store, <CommandBox command={command} />));
    await click(parts(container).button);
    expect(clipboard.copied).toEqual([command]);
    expect(store.list()).toMatchObject([{ tone: "success", title: COMMAND_COPIED }]);
    expect(container.querySelector("p")).toBeNull();
  });

  it("falls back to the browser's copy command without a secure context", async () => {
    const clipboard = fakeClipboard("missing", "works");
    const store = createToastStore();
    const { container } = render(withToasts(store, <CommandBox command={command} />));
    await click(parts(container).button);
    expect(clipboard.copied).toEqual([command]);
    expect(store.list()).toMatchObject([{ title: COMMAND_COPIED }]);
  });

  it("leaves the command selected and says how to copy it when both ways fail", async () => {
    fakeClipboard("refuses", "refuses");
    const store = createToastStore();
    const { container } = render(withToasts(store, <CommandBox command={command} />));
    await click(parts(container).button);
    expect(store.list()).toMatchObject([{ tone: "warning", title: COMMAND_NOT_COPIED }]);
    expect(COMMAND_NOT_COPIED).toBe("Couldn't copy. Select the command and copy it.");
    expect(window.getSelection()?.toString()).toBe(command);
  });

  it("copies through the clipboard the shell provides, as the desktop app's Tauri clipboard", async () => {
    const written: string[] = [];
    const writeClipboard = async (text: string) => {
      written.push(text);
      return true;
    };
    const store = createToastStore();
    const { container } = render(
      <ClipboardProvider writeClipboard={writeClipboard}>
        {withToasts(store, <CommandBox command={command} />)}
      </ClipboardProvider>,
    );
    await click(parts(container).button);
    expect(written).toEqual([command]);
    expect(store.list()).toHaveLength(1);
  });

  it("in a Dialog, says 'Copied' through its polite region, not a toast, and shows a check until blur", async () => {
    fakeClipboard("works");
    const store = createToastStore();
    const { container } = render(withToasts(store, trustDialog()));
    const { button } = parts(container);
    const iconBefore = button.innerHTML;
    await click(button);
    expect(store.list()).toEqual([]);
    expect(politeText(container)).toBe(COMMAND_COPIED);
    expect(button.innerHTML).not.toBe(iconBefore);
    expect(button.querySelector(".text-success")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Copy command");

    act(() => {
      button.dispatchEvent(new FocusEvent("blur"));
    });
    expect(button.querySelector(".text-success")).toBeNull();
    expect(button.innerHTML).toBe(iconBefore);
  });

  it("in a Dialog, says a failure through its region and shows it under the box", async () => {
    fakeClipboard("refuses", "refuses");
    const store = createToastStore();
    const { container } = render(withToasts(store, trustDialog()));
    const { button } = parts(container);
    await click(button);
    expect(store.list()).toEqual([]);
    expect(politeText(container)).toBe(COMMAND_NOT_COPIED);
    const line = button.nextElementSibling as HTMLElement;
    expect(line.textContent).toBe(COMMAND_NOT_COPIED);
    expect(line.hasAttribute("role")).toBe(false);
    expect(button.querySelector(".text-success")).toBeNull();
    expect(window.getSelection()?.toString()).toBe(command);
  });

  it("says the outcome in a status line of its own where nothing else can", async () => {
    fakeClipboard("works");
    const { container, rerender } = render(<CommandBox command={command} />);
    await click(parts(container).button);
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toBe(COMMAND_COPIED);
    expect(status.className).toBe("sr-only");

    restoreClipboard();
    fakeClipboard("refuses", "refuses");
    rerender(<CommandBox command={command} />);
    await click(parts(container).button);
    expect(status.textContent).toBe(COMMAND_NOT_COPIED);
    expect(status.className).toContain("text-caption text-fg-muted");
  });
});
