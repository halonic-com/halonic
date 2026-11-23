import { createShell, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { AssistantHostService } from "./api.ts";
import { buildChatsOf } from "./chat/build-chats.ts";
import { assistantFeature } from "./feature.ts";
import { chatOf, fakeHost } from "./test-support.tsx";

const shell = () =>
  createShell({ features: [assistantFeature], hostServices: [AssistantHostService] });

function contextWith(host: ReturnType<typeof fakeHost>["host"]) {
  const panelWindow = { isOpen: () => false, show: vi.fn(), hide: vi.fn(), toggle: vi.fn() };
  const services = { get: () => host, find: () => host };
  const context = { services, panelWindow } as unknown as WorkspaceContext;
  return { context, panelWindow };
}

describe("assistantFeature", () => {
  it("is registered under its folder name", () => {
    expect(assistantFeature.id).toBe("assistant");
  });

  it("names the app's Assistant host under the feature's id", () => {
    expect(AssistantHostService.name).toBe("assistant.host");
  });
});

verifies("assistant.chat.panel-shortcut", () => {
  it("adds the Assistant panel with its shortcut, which toggles it, as Ctrl K's Assistant does", () => {
    const { contributions } = shell();
    expect(
      contributions.panelWindows.list().map(({ id, title, keys }) => ({ id, title, keys })),
    ).toEqual([{ id: "assistant.panel", title: "Assistant", keys: "Ctrl+Alt+I" }]);
    const binding = contributions.keybindings.resolve("Ctrl+Alt+I", new Set(["workspaceFocused"]));
    const command = contributions.commands.get(binding?.command ?? "");
    expect(command?.title).toBe("Assistant");
    const { context, panelWindow } = contextWith(fakeHost().host);
    void command?.run(context);
    expect(panelWindow.toggle).toHaveBeenCalledOnce();
  });

  it("Ctrl K's New chat shows a new Build chat in the panel and opens it", async () => {
    const fake = fakeHost([
      chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine"),
    ]);
    const chats = buildChatsOf(fake.host);
    await chats.open();
    const { context, panelWindow } = contextWith(fake.host);
    await shell().contributions.commands.get("assistant.new-chat")?.run(context);
    const shown = chats.shown();
    expect(shown.kind === "chat" && shown.view.chat.draft).toBe(true);
    expect(panelWindow.show).toHaveBeenCalledOnce();
  });
});
