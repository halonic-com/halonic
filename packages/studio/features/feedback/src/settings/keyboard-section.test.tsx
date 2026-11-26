// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FeedbackSettingsHost, ShortcutChange } from "../api.ts";
import { KeyboardView } from "./keyboard-section.tsx";
import { button, press, render, settle, unmountAll } from "./test-support.tsx";

afterEach(unmountAll);

function fakeHost(answer: ShortcutChange = "saved") {
  return {
    platform: "windows",
    setShortcut: vi.fn(async (_shortcut: string): Promise<ShortcutChange> => answer),
  } satisfies FeedbackSettingsHost;
}

/** The keys the row shows, as one line: "Ctrl Alt F". */
function shownKeys(container: HTMLElement): string {
  return [...container.querySelectorAll("kbd")].map((key) => key.textContent).join(" ");
}

function showRow(host: FeedbackSettingsHost, announced: string[] = []) {
  return render(
    <KeyboardView host={host} saved="control+alt+KeyF" announce={(l) => announced.push(l)} />,
  );
}

function startRecording(container: HTMLElement) {
  act(() => button(container, "Change").click());
}

verifies("feedback.settings-shortcut", () => {
  it("shows the Send feedback row with the saved keys and Change", () => {
    const container = showRow(fakeHost());

    expect(container.textContent).toContain("Send feedback");
    expect(shownKeys(container)).toBe("Ctrl Alt F");
  });

  it("records Ctrl+Alt+K, asks the shell for it and shows the new keys", async () => {
    const host = fakeHost();
    const container = showRow(host);
    startRecording(container);
    expect(container.textContent).toContain("Press the new shortcut");

    press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    await settle();

    expect(host.setShortcut).toHaveBeenCalledWith("Control+Alt+KeyK");
    expect(shownKeys(container)).toBe("Ctrl Alt K");
    expect(container.textContent).not.toContain("Press the new shortcut");
  });

  it("keeps the old keys and says so when another app holds the new ones", async () => {
    const announced: string[] = [];
    const container = showRow(fakeHost("taken"), announced);
    startRecording(container);

    press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    await settle();

    const taken = "Ctrl+Alt+K is taken by another app. Choose another.";
    expect(shownKeys(container)).toBe("Ctrl Alt F");
    expect(container.querySelector(".text-attention")?.textContent).toBe(taken);
    expect(announced).toEqual([taken]);
  });

  it("says it couldn't save when the shell couldn't, and keeps the old keys", async () => {
    const host = fakeHost();
    host.setShortcut.mockRejectedValueOnce(new Error("no shell"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = showRow(host);
    startRecording(container);

    press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    await settle();

    expect(shownKeys(container)).toBe("Ctrl Alt F");
    expect(container.textContent).toContain(`Couldn't save "Send feedback" on this computer.`);
  });

  it("stops on Esc without a change, and Esc goes no further", async () => {
    const host = fakeHost();
    const container = showRow(host);
    const heard = vi.fn();
    document.body.addEventListener("keydown", heard);
    startRecording(container);

    const prevented = press({ code: "Escape", key: "Escape" });
    await settle();
    document.body.removeEventListener("keydown", heard);

    expect(prevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    expect(host.setShortcut).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Press the new shortcut");
    expect(shownKeys(container)).toBe("Ctrl Alt F");
  });

  it("refuses a press without Ctrl, Alt or ⌘ and keeps recording", async () => {
    const host = fakeHost();
    const container = showRow(host);
    startRecording(container);

    press({ code: "KeyK", key: "K", shiftKey: true });
    press({ code: "ControlLeft", key: "Control", ctrlKey: true });
    await settle();

    expect(host.setShortcut).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Press the new shortcut");
  });

  it("stops when Change is chosen again", () => {
    const container = showRow(fakeHost());
    startRecording(container);
    startRecording(container);

    expect(container.textContent).not.toContain("Press the new shortcut");
  });

  it("stops when the person leaves the row", () => {
    const container = showRow(fakeHost());
    const change = button(container, "Change");
    act(() => change.focus());
    startRecording(container);
    act(() => change.blur());

    expect(container.textContent).not.toContain("Press the new shortcut");
  });

  it("shows ⌘ ⌥ F on macOS when nothing is saved", () => {
    const host = { ...fakeHost(), platform: "macos" } as const;
    const container = render(
      <KeyboardView host={host} saved="CommandOrControl+Alt+F" announce={() => undefined} />,
    );

    expect(shownKeys(container)).toBe("⌘ ⌥ F");
  });
});
