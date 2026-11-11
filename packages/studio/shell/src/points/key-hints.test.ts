import { keyShortcutsLabel } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ShellError } from "../shell-error.ts";
import { hintKeys } from "./key-hints.ts";

verifies("shell.key-hints", () => {
  it("shows Mod as ⌘ on macOS and as Ctrl elsewhere", () => {
    expect(hintKeys("Mod+K", "macos")).toEqual(["⌘", "K"]);
    expect(hintKeys("Mod+K", "windows")).toEqual(["Ctrl", "K"]);
    expect(hintKeys("Mod+K", "linux")).toEqual(["Ctrl", "K"]);
  });

  it("puts Mod first and the other modifiers in one order", () => {
    expect(hintKeys("shift+mod+t", "windows")).toEqual(["Ctrl", "Shift", "T"]);
    expect(hintKeys("Mod+Shift+T", "macos")).toEqual(["⌘", "Shift", "T"]);
    expect(hintKeys("Alt+Ctrl+A", "windows")).toEqual(["Ctrl", "Alt", "A"]);
    expect(hintKeys("Ctrl+Tab", "macos")).toEqual(["Ctrl", "Tab"]);
    expect(hintKeys("F6", "windows")).toEqual(["F6"]);
  });

  it("draws Escape and the arrows short, as the kit's Kbd does", () => {
    expect(hintKeys("Escape", "linux")).toEqual(["Esc"]);
    expect(hintKeys("Alt+ArrowUp", "linux")).toEqual(["Alt", "↑"]);
  });

  it("keeps the plus key apart from the separator", () => {
    expect(hintKeys("Mod++", "windows")).toEqual(["Ctrl", "+"]);
    expect(hintKeys("+", "windows")).toEqual(["+"]);
  });

  it("gives keys the kit names back for aria-keyshortcuts", () => {
    expect(keyShortcutsLabel(hintKeys("Mod+Shift+T", "macos"))).toBe("Meta+Shift+T");
    expect(keyShortcutsLabel(hintKeys("Mod+Enter", "windows"))).toBe("Control+Enter");
    expect(keyShortcutsLabel(hintKeys("Escape", "windows"))).toBe("Escape");
  });

  it("refuses keys a keybinding couldn't use", () => {
    expect(() => hintKeys("Mod+", "windows")).toThrow(ShellError);
  });
});
