// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OutgoingFeedback } from "../send/hand-on.ts";
import { startInAppFeedback, stillLifetime } from "./in-app-feedback.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The shell's answer to `plugin:feedback|crop`: a 20 × 10 crop, its size first. */
function cropBytes(): ArrayBuffer {
  const bytes = new Uint8Array(8 + 20 * 10 * 4);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 20, true);
  header.setUint32(4, 10, true);
  return bytes.buffer;
}

function fakeShell(start: () => Promise<unknown> = async () => ({ width: 200, height: 100 })) {
  return {
    invoke: vi.fn(async (command: string, _args?: Record<string, unknown>): Promise<unknown> => {
      if (command === "plugin:feedback|start") return start();
      if (command === "plugin:feedback|crop") return cropBytes();
      return null;
    }),
  };
}

const details = {
  project: "Acme apps",
  assignee: "Robin",
  studioVersion: "0.2.0",
  mac: false,
  now: () => new Date("2026-11-25T17:04:05Z"),
};

const canvasPrototype = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
let stop: (() => void) | undefined;
let sent: OutgoingFeedback[] = [];

beforeEach(() => {
  Object.assign(window, { innerWidth: 100, innerHeight: 50 });
  // jsdom has `<dialog>` but no `showModal()` or `close()`, and its canvas draws nothing.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  canvasPrototype["getContext"] = () => ({
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: () => undefined,
    drawImage: () => undefined,
  });
  vi.stubGlobal("ImageData", class {});
  canvasPrototype["toBlob"] = function toBlob(done: (blob: Blob | null) => void) {
    done(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }));
  };
});

afterEach(() => {
  act(() => stop?.());
  stop = undefined;
  sent = [];
  delete canvasPrototype["getContext"];
  delete canvasPrototype["toBlob"];
  vi.unstubAllGlobals();
});

function startWith(shell: ReturnType<typeof fakeShell>, shortcut = "CommandOrControl+Shift+F") {
  stop = startInAppFeedback({
    ipc: shell,
    platform: "windows",
    shortcut: () => shortcut,
    window,
    send: async (feedback) => {
      sent.push(feedback);
      return { kind: "taken" };
    },
    details: () => details,
  });
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

function dialog() {
  return document.querySelector("dialog");
}

function ends(shell: ReturnType<typeof fakeShell>) {
  return shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|end");
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === name || button.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`No ${name} button.`);
  return found;
}

/** Presses the shortcut, then Enter on the overlay, and waits for the Send feedback dialog. */
async function selectWholeWindow(shell: ReturnType<typeof fakeShell>) {
  startWith(shell);
  await press(ctrlShiftF);
  await vi.waitFor(() => expect(overlay()).not.toBeNull());
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
  await vi.waitFor(() => expect(document.body.textContent).toContain("20 × 10"));
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

  it("shows nothing when the shell says capture isn't available", async () => {
    const shell = fakeShell(() => Promise.reject("unavailable"));
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

verifies("feedback.send-window", () => {
  it("opens the Send feedback dialog in the same window after a selection", async () => {
    const shell = fakeShell();
    await selectWholeWindow(shell);
    expect(overlay()).toBeNull();
    expect(dialog()?.open).toBe(true);
    expect(document.querySelectorAll("[data-feedback-layer]")).toHaveLength(1);
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|crop");
    expect(document.body.textContent).toContain(
      "Goes to Acme apps as a task in Paperclip for Robin, with the app, window, time and Studio version.",
    );
  });

  it.each([
    ["Cancel", () => act(() => buttonNamed("Cancel").click())],
    ["the ✕", () => act(() => buttonNamed("Close Send feedback").click())],
    [
      "Esc",
      () => act(() => void dialog()?.dispatchEvent(new Event("cancel", { cancelable: true }))),
    ],
  ])("closes on %s and ends the feedback", async (_way, close) => {
    const shell = fakeShell();
    await selectWholeWindow(shell);
    close();
    expect(dialog()).toBeNull();
    expect(document.querySelector("[data-feedback-layer]")).toBeNull();
    expect(ends(shell)).toHaveLength(1);
  });

  it("sends the feedback, then closes and ends", async () => {
    const shell = fakeShell();
    await selectWholeWindow(shell);
    const field = document.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    act(() => {
      setter?.call(field, "Run list jumps");
      field?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Send is the dialog's submit button; its text also holds the hidden "Sending…".
    await act(async () =>
      document.querySelector<HTMLButtonElement>('dialog button[type="submit"]')?.click(),
    );
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(sent.map((feedback) => feedback.task.title)).toEqual(["Run list jumps"]);
    expect(ends(shell)).toHaveLength(1);
  });

  it("keeps the dialog and its text on another press of the shortcut", async () => {
    const shell = fakeShell();
    await selectWholeWindow(shell);
    await press(ctrlShiftF);
    expect(dialog()?.open).toBe(true);
    expect(
      shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|start"),
    ).toHaveLength(1);
    expect(ends(shell)).toEqual([]);
  });
});

/** Types `text` into the dialog's field as React hears it. */
function typeInDialog(text: string) {
  const field = document.querySelector("textarea");
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function starts(shell: ReturnType<typeof fakeShell>) {
  return shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|start");
}

verifies("feedback.select-again", () => {
  beforeEach(() => {
    document.title = "Runs · Acme · Halonic";
  });
  afterEach(() => {
    document.title = "";
  });

  it("names the window the shortcut was pressed in under the crop", async () => {
    await selectWholeWindow(fakeShell());
    expect(document.querySelector("[data-feedback-size]")?.textContent).toBe(
      "Halonic · Runs · Acme · 20 × 10",
    );
  });

  it("closes the dialog, selects again once it's gone and opens the next with the text", async () => {
    const shell = fakeShell();
    await selectWholeWindow(shell);
    typeInDialog("Run list jumps");
    act(() => buttonNamed("Select again").click());
    expect(dialog()).toBeNull();
    // The still is asked for only after the window drew without the dialog.
    expect(starts(shell)).toHaveLength(1);
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
    expect(starts(shell)).toHaveLength(2);
    expect(ends(shell)).toEqual([]);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    await vi.waitFor(() => expect(dialog()?.open).toBe(true));
    expect(document.querySelector("textarea")?.value).toBe("Run list jumps");
  });

  it("brings the dialog back with the text when the shell gives no new still", async () => {
    let answers = 0;
    const shell = fakeShell(async () => {
      answers += 1;
      if (answers > 1) throw "busy";
      return { width: 200, height: 100 };
    });
    await selectWholeWindow(shell);
    typeInDialog("Run list jumps");
    act(() => buttonNamed("Select again").click());
    await vi.waitFor(() => expect(dialog()?.open).toBe(true));
    expect(starts(shell)).toHaveLength(2);
    expect(overlay()).toBeNull();
    expect(document.querySelector("textarea")?.value).toBe("Run list jumps");
    expect(ends(shell)).toEqual([]);
  });
});
