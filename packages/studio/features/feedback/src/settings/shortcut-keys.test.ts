import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { recordedShortcut, shortcutKeys, shortcutText } from "./shortcut-keys.ts";

const none = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

verifies("feedback.settings-shortcut", () => {
  describe("recordedShortcut", () => {
    it("names the physical key with its modifiers, as the shell reads it", () => {
      expect(recordedShortcut({ ...none, code: "KeyK", ctrlKey: true, altKey: true })).toBe(
        "Control+Alt+KeyK",
      );
      expect(recordedShortcut({ ...none, code: "Digit1", metaKey: true, shiftKey: true })).toBe(
        "Super+Shift+Digit1",
      );
    });

    it("records nothing while only modifiers are held, or without Ctrl, Alt or ⌘", () => {
      expect(recordedShortcut({ ...none, code: "AltLeft", altKey: true })).toBeUndefined();
      expect(recordedShortcut({ ...none, code: "KeyF", shiftKey: true })).toBeUndefined();
      expect(recordedShortcut({ ...none, code: "F5" })).toBeUndefined();
    });
  });

  describe("shortcutKeys", () => {
    it("shows the shell's saved words as keys, the modifiers first", () => {
      expect(shortcutKeys("shift+control+alt+KeyK", "windows")).toEqual([
        "Ctrl",
        "Alt",
        "Shift",
        "K",
      ]);
      expect(shortcutKeys("control+super+ArrowUp", "linux")).toEqual(["Ctrl", "Super", "↑"]);
      expect(shortcutKeys("super+alt+F5", "windows")).toEqual(["Win", "Alt", "F5"]);
    });

    it("shows CommandOrControl as ⌘ on macOS and Ctrl elsewhere", () => {
      expect(shortcutKeys("CommandOrControl+Alt+F", "macos")).toEqual(["⌘", "⌥", "F"]);
      expect(shortcutKeys("CommandOrControl+Alt+F", "linux")).toEqual(["Ctrl", "Alt", "F"]);
    });
  });

  it("writes keys in a sentence as each platform does", () => {
    expect(shortcutText(["Ctrl", "Alt", "K"], "windows")).toBe("Ctrl+Alt+K");
    expect(shortcutText(["⌘", "⌥", "K"], "macos")).toBe("⌘⌥K");
  });
});
