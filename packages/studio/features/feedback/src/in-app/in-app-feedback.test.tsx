// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startInAppFeedback } from "./in-app-feedback.tsx";

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

  it("leaves a press to the shortcut recorder while it records", async () => {
    const shell = fakeShell();
    startWith(shell);
    const record = (event: KeyboardEvent) => event.stopImmediatePropagation();
    window.addEventListener("keydown", record, true);
    try {
      await press(ctrlShiftF);
    } finally {
      window.removeEventListener("keydown", record, true);
    }
    expect(shell.invoke).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
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

  it("uses the saved shortcut", async () => {
    const shell = fakeShell();
    startWith(shell, "control+alt+KeyK");
    await press(ctrlShiftF);
    expect(shell.invoke).not.toHaveBeenCalled();
    await press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|start");
  });
});
