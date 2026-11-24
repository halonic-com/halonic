// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Chat, ModelOption, ModelProblem } from "../api.ts";
import { buttonNamed, chatOf, fakeHost, sendMessage, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

afterEach(unmount);

function panel(fake: ReturnType<typeof fakeHost>) {
  const runCommand = vi.fn(() => true);
  const openSettings = vi.fn();
  const services = { get: () => fake.host, find: () => fake.host };
  const context = {
    services,
    announcer: { announce: vi.fn() },
    runCommand,
    openSettings,
  } as unknown as WorkspaceContext;
  const node = <AssistantPanel context={context} title="Assistant" onClose={() => {}} />;
  return { node, runCommand, openSettings };
}

const onSmart: Chat = { ...chatOf("c1"), model: { kind: "alias", name: "smart" } };
const smart = (problem: ModelProblem | null): ModelOption => ({
  model: { kind: "alias", name: "smart" },
  label: "smart",
  from: "workspace",
  problem,
});
const needsKey: ModelProblem = { kind: "needs-key", provider: "Anthropic", secretName: "ANT" };
const box = (page: HTMLElement) => page.querySelector("textarea") as HTMLTextAreaElement;
const status = (page: HTMLElement) => page.querySelector('[role="status"]')?.textContent ?? "";

verifies("assistant.chat.model-line", () => {
  describe("the line the chat's model puts under the box", () => {
    it("says the assistant has no model yet, and Send keeps the message and goes to Settings › (H18)", async () => {
      const fake = fakeHost([chatOf("c1")], { models: [] });
      const { node, openSettings } = panel(fake);
      const page = await show(node);
      expect(status(page)).toContain(
        "The assistant has no model yet. Add a model alias or choose an Assistant model in Settings › Assistant.",
      );
      await sendMessage(page, "Add a routine");
      expect(fake.requests).toEqual([]);
      expect(box(page).value).toBe("Add a routine");
      const link = buttonNamed(page, "Settings ›");
      expect(document.activeElement).toBe(link);
      await act(async () => link?.click());
      expect(openSettings).toHaveBeenCalledWith("assistant");
    });

    it("names the model and its provider's missing key, with Set the key › (H19)", async () => {
      const fake = fakeHost([onSmart], { models: [smart(needsKey)] });
      const { node, runCommand } = panel(fake);
      const page = await show(node);
      expect(status(page)).toContain(
        "The assistant has no model it can use: smart needs an API key for Anthropic.",
      );
      expect(page.querySelector('[role="status"] code')?.textContent).toBe("smart");
      await sendMessage(page, "Add a routine");
      expect(fake.requests).toEqual([]);
      expect(document.activeElement).toBe(buttonNamed(page, "Set the key ›"));
      await act(async () => buttonNamed(page, "Set the key ›")?.click());
      expect(runCommand).toHaveBeenCalledWith("workspace.open-models");
    });

    it("reads the models again on Send, so a key set since lets the next Send go", async () => {
      const models = [smart(needsKey)];
      const fake = fakeHost([onSmart], { models });
      const page = await show(panel(fake).node);
      models[0] = smart(null);
      await sendMessage(page, "Add a routine");
      expect(status(page)).not.toContain("needs an API key");
      expect(document.activeElement).toBe(box(page));
      await act(async () => buttonNamed(page, "Send")?.click());
      expect(fake.requests[0]?.message).toBe("Add a routine");
    });

    it("says a local-only workspace can't use a cloud model, and Send waits on that line (H20)", async () => {
      const localOnly: ModelProblem = { kind: "local-only", workspace: "Acme" };
      const fake = fakeHost([onSmart], { models: [smart(localOnly)] });
      const page = await show(panel(fake).node);
      const line = "Acme is local only, so the assistant can't use smart. Pick a local model.";
      expect(status(page)).toContain(line);
      await sendMessage(page, "Add a routine");
      expect(fake.requests).toEqual([]);
      expect(box(page).value).toBe("Add a routine");
      const reason = buttonNamed(page, "Send")?.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(reason)?.textContent).toContain(line);
    });

    it("shows no line for a model that can be used, nor in an agent chat", async () => {
      const asked = chatOf("c2", [{ role: "user", content: "Sort this" }], "Sort this");
      const agentChat: Chat = { ...asked, kind: "agent:support/triage" };
      const page = await show(panel(fakeHost([onSmart], { models: [smart(null)] })).node);
      expect(status(page)).toBe("");
      unmount();
      const agents = await show(panel(fakeHost([agentChat], { models: [] })).node);
      expect(status(agents)).toBe("");
    });
  });
});
