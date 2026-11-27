import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseTopLevelWindows, topLevelWindowsScript } from "./top-level-windows.ts";

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
});
