import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  keyboardFocusScript,
  parseKeyboardFocus,
  parseTopLevelWindows,
  topLevelWindowsScript,
} from "./top-level-windows.ts";

verifies("studio-click-test.paperclip-steps", () => {
  it("reads one image per window, whatever the line ends", () => {
    const output = "Halonic Inbox.exe\r\n\r\n  Halonic Messenger.exe \n";
    expect(parseTopLevelWindows(output)).toEqual(["Halonic Inbox.exe", "Halonic Messenger.exe"]);
    expect(parseTopLevelWindows("")).toEqual([]);
  });

  it("asks Windows for each visible top-level window's process, by the exe it is given", () => {
    expect(topLevelWindowsScript).toContain("GetWindowThreadProcessId");
    expect(topLevelWindowsScript).toContain("IsWindowVisible");
    expect(topLevelWindowsScript).toContain("$env:CLICK_TEST_EXE");
  });

  it("reads where typing goes, and takes anything unknown as no focus", () => {
    expect(parseKeyboardFocus("Halonic Inbox.exe|page\r\n")).toEqual({
      image: "Halonic Inbox.exe",
      focus: "page",
    });
    expect(parseKeyboardFocus("Halonic Inbox.exe|window")).toMatchObject({ focus: "window" });
    expect(parseKeyboardFocus("")).toEqual({ image: "", focus: "none" });
    expect(parseKeyboardFocus("Halonic.exe|elsewhere")).toMatchObject({ focus: "none" });
  });

  it("asks Windows for the foreground window's keyboard focus and whether its page holds it", () => {
    expect(keyboardFocusScript).toContain("GetForegroundWindow");
    expect(keyboardFocusScript).toContain("GetGUIThreadInfo");
    expect(keyboardFocusScript).toContain("IsChild");
  });
});
