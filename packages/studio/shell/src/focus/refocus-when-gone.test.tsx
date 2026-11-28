// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { useRefocusWhenGone, useTellWhenGoneWithFocus } from "./refocus-when-gone.ts";

afterEach(unmountAll);

function Line({ onGoneWithFocus }: { readonly onGoneWithFocus: () => void }) {
  const tryAgain = useRef<HTMLButtonElement>(null);
  useTellWhenGoneWithFocus(tryAgain, onGoneWithFocus);
  return (
    <button type="button" ref={tryAgain}>
      Try again
    </button>
  );
}

let setFailed: (failed: boolean) => void = () => undefined;

/** New chat, a failure line with Try again while `setFailed(true)`, and a prompt box. */
function Column() {
  const [failed, setShown] = useState(true);
  setFailed = (next) => act(() => setShown(next));
  const newChat = useRef<HTMLButtonElement>(null);
  const lineGone = useRefocusWhenGone(() => newChat.current?.focus());
  return (
    <>
      <button type="button" ref={newChat}>
        New chat
      </button>
      {failed && <Line onGoneWithFocus={lineGone} />}
      <input aria-label="Prompt" />
    </>
  );
}

function named(container: HTMLElement, name: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>("button, input")].find(
    (each) => each.textContent?.trim() === name || each.getAttribute("aria-label") === name,
  );
}

describe("useRefocusWhenGone", () => {
  it("moves the focus when the control goes while it holds the focus", () => {
    const container = render(<Column />);
    act(() => named(container, "Try again")?.focus());
    setFailed(false);
    expect(document.activeElement).toBe(named(container, "New chat"));
  });

  it("leaves the focus on the page when the control goes without it", () => {
    const container = render(<Column />);
    setFailed(false);
    expect(named(container, "Try again")).toBeUndefined();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves the focus elsewhere when the control goes without it", () => {
    const container = render(<Column />);
    act(() => named(container, "Prompt")?.focus());
    setFailed(false);
    expect(document.activeElement).toBe(named(container, "Prompt"));
  });

  it("counts each going once", () => {
    const container = render(<Column />);
    act(() => named(container, "Try again")?.focus());
    setFailed(false);
    act(() => named(container, "New chat")?.blur());
    setFailed(true);
    setFailed(false);
    expect(document.activeElement).toBe(document.body);
  });
});
