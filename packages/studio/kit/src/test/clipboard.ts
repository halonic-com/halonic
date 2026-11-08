/**
 * A fake clipboard for component tests. jsdom has neither `navigator.clipboard` nor
 * `document.execCommand`, so a test says how each one behaves and reads back what was copied.
 */
import { afterEach } from "vitest";

/** How one way of copying behaves: it works, it refuses, or the browser doesn't have it. */
export type CopyWay = "works" | "refuses" | "missing";

export interface FakeClipboard {
  /** Every text that reached the clipboard, in order. */
  readonly copied: string[];
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
});

/**
 * Installs the fake for the rest of the test.
 *
 * @param api - how `navigator.clipboard.writeText` behaves
 * @param selection - how the fallback, `document.execCommand("copy")`, behaves
 */
export function fakeClipboard(api: CopyWay, selection: CopyWay = "missing"): FakeClipboard {
  const copied: string[] = [];

  if (api !== "missing") {
    const writeText = async (text: string) => {
      if (api === "refuses") {
        throw new DOMException("Write permission denied.", "NotAllowedError");
      }
      copied.push(text);
    };
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  }

  if (selection !== "missing") {
    const execCommand = (command: string) => {
      const box = document.activeElement;
      if (selection === "refuses" || command !== "copy" || !(box instanceof HTMLTextAreaElement)) {
        return false;
      }
      copied.push(box.value.slice(box.selectionStart, box.selectionEnd));
      return true;
    };
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
  }

  return { copied };
}
