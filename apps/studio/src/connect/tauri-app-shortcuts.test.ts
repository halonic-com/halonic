import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { tauriAppShortcuts } from "./tauri-app-shortcuts.ts";
import { settled } from "./test/connect-page-harness.ts";

/** The bridge over a shell that answers `answer` to every call. */
function shellAnswering(answer: Promise<unknown>) {
  const invoke = vi.fn((_command: string, _args?: Record<string, unknown>) => answer);
  const report = vi.fn();
  return { invoke, report, shortcuts: tauriAppShortcuts({ invoke }, report) };
}

verifies("studio.connect.app-shortcuts", () => {
  it.each([
    [{ screen: "inbox" }, { screen: "inbox" }],
    [{ screen: "messenger" }, { screen: "messenger" }],
    [
      { screen: "chat", computer: "acme-desk", chat: "c1" },
      { screen: "chat", computer: "acme-desk", chat: "c1" },
    ],
    [{ screen: "chat", computer: "acme-desk" }, { screen: "messenger" }],
    [{ screen: "settings" }, undefined],
    [null, undefined],
    ["inbox", undefined],
  ])("reads the shell's %j as %j", async (answer, opening) => {
    const { invoke, shortcuts } = shellAnswering(Promise.resolve(answer));
    expect(await shortcuts.takeOpening()).toEqual(opening);
    expect(invoke).toHaveBeenCalledWith("phone_open_target");
  });

  it("sets and removes the last chat, and pins only the screen it's given", async () => {
    const { invoke, report, shortcuts } = shellAnswering(Promise.resolve(true));
    const chat = { computer: "acme-desk", chat: "c1", name: "Launch review" };
    shortcuts.setLastChat(chat);
    shortcuts.setLastChat(undefined);
    shortcuts.pin("messenger");
    await settled();
    expect(invoke.mock.calls).toEqual([
      ["phone_last_chat", { chat }],
      ["phone_last_chat", { chat: null }],
      ["phone_pin", { screen: "messenger" }],
    ]);
    expect(report).not.toHaveBeenCalled();
    expect(await shortcuts.canPin()).toBe(true);
  });

  it("logs a refusal or a call that did nothing, and reads them as no screen and no pinning", async () => {
    const refused = shellAnswering(Promise.reject(new Error("not allowed")));
    expect(await refused.shortcuts.takeOpening()).toBeUndefined();
    expect(await refused.shortcuts.canPin()).toBe(false);
    expect(refused.report.mock.calls).toEqual([
      ["phone_open_target was refused: Error: not allowed"],
      ["phone_can_pin was refused: Error: not allowed"],
    ]);

    const nothing = shellAnswering(Promise.resolve(false));
    nothing.shortcuts.pin("inbox");
    nothing.shortcuts.setLastChat(undefined);
    await settled();
    expect(nothing.report.mock.calls).toEqual([
      ["phone_pin did nothing."],
      ["phone_last_chat did nothing."],
    ]);
  });
});
