// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SecretText } from "../secret-text/secret-text.ts";
import { fakeClipboard, restoreClipboard } from "../test/clipboard.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { COPIED_FOR_MS, CopyButton } from "./copy-button.tsx";

function renderButton() {
  const { container } = render(<CopyButton text="Halonic (own app)" label="Copy the app name" />);
  const button = container.querySelector("button") as HTMLButtonElement;
  const status = container.querySelector('[role="status"]') as HTMLElement;
  /** The word a sighted user sees: the one that isn't invisible. */
  const shownWord = () => button.querySelector(":scope > span:not(.invisible)")?.textContent;
  return { button, status, shownWord };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  restoreClipboard();
  vi.useRealTimers();
});

verifies("kit.copy-button", () => {
  it("is a plain button named after what it copies, and says Copy", () => {
    fakeClipboard("works");
    const { button, status, shownWord } = renderButton();
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Copy the app name");
    expect(shownWord()).toBe("Copy");
    expect(status.textContent).toBe("");
  });

  it("is 40px with a 48px hit area on a touch screen and 48px on a phone, like a Button", () => {
    fakeClipboard("works");
    const { className } = renderButton().button;
    expect(className).toContain("touch:min-h-control-lg touch:px-4 touch:hit-touch");
    expect(className).toContain("phone:h-touch phone:px-4");
    expect(className).toContain("hover:bg-surface-subtle active:bg-surface-subtle");
  });

  it("copies its text, says Copied in place and tells screen readers", async () => {
    const clipboard = fakeClipboard("works");
    const { button, status, shownWord } = renderButton();

    await click(button);

    expect(clipboard.copied).toEqual(["Halonic (own app)"]);
    expect(shownWord()).toBe("Copied");
    expect(status.textContent).toBe("Copied");
    expect(status.className).toBe("sr-only");
  });

  it("says Copy again after a moment", async () => {
    fakeClipboard("works");
    const { button, status, shownWord } = renderButton();
    await click(button);

    act(() => vi.advanceTimersByTime(COPIED_FOR_MS - 1));
    expect(shownWord()).toBe("Copied");
    act(() => vi.advanceTimersByTime(1));
    expect(shownWord()).toBe("Copy");
    expect(status.textContent).toBe("");
  });

  it("starts the moment again on a second copy", async () => {
    const clipboard = fakeClipboard("works");
    const { button, shownWord } = renderButton();
    await click(button);
    act(() => vi.advanceTimersByTime(COPIED_FOR_MS - 500));

    await click(button);
    act(() => vi.advanceTimersByTime(COPIED_FOR_MS - 1));

    expect(clipboard.copied).toHaveLength(2);
    expect(shownWord()).toBe("Copied");
  });

  it("shows how to copy by hand when the clipboard refuses", async () => {
    fakeClipboard("refuses", "refuses");
    const { button, status, shownWord } = renderButton();

    await click(button);

    expect(shownWord()).toBe("Copy");
    expect(status.textContent).toBe("Couldn't copy. Select the text and copy it yourself.");
    expect(status.className).not.toContain("sr-only");
  });

  it("has a status region in the page before anything is copied, so the first copy is read", () => {
    fakeClipboard("works");
    const { status } = renderButton();
    expect(status.isConnected).toBe(true);
  });
});

verifies("kit.copy-button-no-secrets", () => {
  const secret = new SecretText("fake-client-secret");

  it("can't be given a secret field's value: the types refuse it", () => {
    // @ts-expect-error A SecretText is not a string, so CopyButton can't take one.
    const element = <CopyButton text={secret} label="Copy the secret" />;
    expect(element.props.text).toBe(secret);
  });

  it("refuses a secret at run time too, before anything reaches the clipboard", () => {
    const clipboard = fakeClipboard("works");
    const props = { text: secret as unknown as string, label: "Copy the secret" };
    expect(() => CopyButton(props)).toThrow(
      "CopyButton copies plain text only. A secret field's value can never be copied.",
    );
    expect(clipboard.copied).toEqual([]);
  });
});
