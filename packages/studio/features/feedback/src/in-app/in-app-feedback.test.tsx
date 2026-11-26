// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startInAppFeedback, stillLifetime } from "./in-app-feedback.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeShell(start: () => Promise<unknown> = async () => ({ width: 200, height: 100 })) {
  return {
    invoke: vi.fn(
      async (command: string, _args?: Record<string, unknown>): Promise<unknown> =>
        command === "plugin:feedback|start" ? start() : null,
    ),
  };
}

let stop: (() => void) | undefined;

beforeEach(() => {
  Object.assign(window, { innerWidth: 100, innerHeight: 50 });
});

afterEach(() => {
  act(() => stop?.());
  stop = undefined;
});

function startWith(shell: ReturnType<typeof fakeShell>, shortcut = "CommandOrControl+Shift+F") {
  stop = startInAppFeedback({ ipc: shell, platform: "windows", shortcut: () => shortcut, window });
}

/** A key press on a text field, as when the person types in the composer. */
async function press(init: KeyboardEventInit) {
  const field = document.createElement("textarea");
  document.body.append(field);
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
  });
  field.remove();
}

const ctrlShiftF = { code: "KeyF", key: "F", ctrlKey: true, shiftKey: true };

function overlay() {
  return document.querySelector("[data-feedback-overlay]");
}

verifies("feedback.in-app", () => {
  it("starts on Ctrl+Shift+F, even in a text field, and shows the overlay in the window", async () => {
    const shell = fakeShell();
    startWith(shell);
    await press(ctrlShiftF);
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|start");
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
  });

  it("does nothing on Shift+F, Ctrl+F or a held key's repeats", async () => {
    const shell = fakeShell();
    startWith(shell);
    await press({ code: "KeyF", key: "F", shiftKey: true });
    await press({ code: "KeyF", key: "f", ctrlKey: true });
    await press({ ...ctrlShiftF, repeat: true });
    expect(shell.invoke).not.toHaveBeenCalled();
  });

  it("ends the feedback and takes the overlay away on a second press", async () => {
    const shell = fakeShell();
    startWith(shell);
    await press(ctrlShiftF);
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
    await press(ctrlShiftF);
    expect(overlay()).toBeNull();
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|end");
  });

  it("shows nothing when the shell brought the Send feedback window forward", async () => {
    const shell = fakeShell(() => Promise.reject("send_open"));
    startWith(shell);
    await press(ctrlShiftF);
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|start");
    expect(overlay()).toBeNull();
  });

  it("takes the overlay away when the shell drops the still, after two minutes", async () => {
    vi.useFakeTimers();
    try {
      const shell = fakeShell();
      startWith(shell);
      await press(ctrlShiftF);
      expect(overlay()).not.toBeNull();
      await act(async () => vi.advanceTimersByTime(stillLifetime - 1));
      expect(overlay()).not.toBeNull();
      await act(async () => vi.advanceTimersByTime(1));
      expect(overlay()).toBeNull();
      expect(stillLifetime).toBe(120_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hears the default when the saved shortcut holds none of Ctrl, Alt and ⌘", async () => {
    const shell = fakeShell();
    startWith(shell, "Shift+F");
    await press({ code: "KeyF", key: "F", shiftKey: true });
    expect(shell.invoke).not.toHaveBeenCalled();
    await press(ctrlShiftF);
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|start");
  });

  it("uses the saved shortcut", async () => {
    const shell = fakeShell();
    startWith(shell, "control+alt+KeyK");
    await press(ctrlShiftF);
    expect(shell.invoke).not.toHaveBeenCalled();
    await press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|start");
  });
});
