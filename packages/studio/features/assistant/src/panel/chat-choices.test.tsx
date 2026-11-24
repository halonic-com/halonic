// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ChatAgent, ModelOption } from "../api.ts";
import { buttonNamed, chatOf, fakeHost, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

// jsdom has no popover API; a menu item's click hides its menu before it acts.
beforeAll(() => {
  for (const name of ["showPopover", "hidePopover"]) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} });
  }
});
afterAll(() => {
  for (const name of ["showPopover", "hidePopover"]) {
    Reflect.deleteProperty(HTMLElement.prototype, name);
  }
});
afterEach(() => unmount());

const models: ModelOption[] = [
  { model: { kind: "assistant" }, label: "claude-sonnet-5-5", from: "settings", problem: null },
  { model: { kind: "alias", name: "default" }, label: "default", from: "workspace", problem: null },
  {
    model: { kind: "alias", name: "cloud" },
    label: "cloud",
    from: "workspace",
    problem: { kind: "needs-key", provider: "Anthropic", secretName: "anthropic-api-key" },
  },
  {
    model: { kind: "alias", name: "far" },
    label: "far",
    from: "workspace",
    problem: { kind: "local-only", workspace: "Acme" },
  },
];
const triage: ChatAgent = {
  kind: "agent:support/triage",
  name: "Triage",
  description: "Sorts incoming mail by topic",
  model: "smart",
};
const routine = {
  ...chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine"),
  model: { kind: "alias", name: "default" } as const,
};

function panel(fake: ReturnType<typeof fakeHost>) {
  const services = { get: () => fake.host, find: () => fake.host };
  const context = { services, announcer: { announce: vi.fn() } } as unknown as WorkspaceContext;
  return <AssistantPanel context={context} title="Assistant" onClose={() => {}} />;
}

/** The menu items under the chip whose text starts with `chip`, by their text. */
function items(page: HTMLElement, chip: string) {
  const trigger = [...page.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith(chip),
  );
  const menu = document.getElementById(trigger?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
}

const chip = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.startsWith(label))
    ?.textContent;

verifies("assistant.chat.model-per-chat", () => {
  it("shows the chat's model, the Assistant model first, unusable aliases with their reason", async () => {
    const page = await show(panel(fakeHost([routine], { models })));
    expect(chip(page, "Model:")).toBe("Model: default");
    const listed = items(page, "Model:");
    expect(listed.map((item) => item.textContent)).toEqual([
      "Assistant model · claude-sonnet-5-5",
      "default",
      "cloudNeeds a key for Anthropic",
      "farAcme is local only",
    ]);
    expect(listed[1]?.getAttribute("aria-checked")).toBe("true");
  });

  it("changes the model of this chat only", async () => {
    const other = {
      ...chatOf("c2", [{ role: "user", content: "Hi" }], "Hi"),
      model: routine.model,
    };
    const fake = fakeHost([routine, other], { models });
    const page = await show(panel(fake));
    await act(async () => items(page, "Model:")[0]?.click());
    expect(chip(page, "Model:")).toBe("Model: claude-sonnet-5-5");
    expect(fake.kept().find((chat) => chat.id === "c1")?.model).toEqual({ kind: "assistant" });
    expect(fake.kept().find((chat) => chat.id === "c2")?.model).toEqual(routine.model);
  });

  it("keeps showing an alias that was removed", async () => {
    const gone = { ...routine, model: { kind: "alias", name: "smart" } as const };
    const page = await show(panel(fakeHost([gone], { models })));
    expect(chip(page, "Model:")).toBe("Model: smart");
  });
});

verifies("assistant.chat.switch-build-or-agent", () => {
  it("lists Build the workspace first, then the agents", async () => {
    const page = await show(panel(fakeHost([routine], { models, agents: [triage] })));
    expect(chip(page, "Chat with:")).toBe("Chat with: Build");
    expect(items(page, "Chat with:").map((item) => item.textContent)).toEqual([
      "Build the workspace",
      "Triage",
    ]);
  });

  it("starts a new chat with the agent and keeps the Build chat in the recent chats", async () => {
    const fake = fakeHost([routine], { models, agents: [triage] });
    const page = await show(panel(fake));
    await act(async () => items(page, "Chat with:")[1]?.click());
    expect(chip(page, "Chat with:")).toBe("Chat with: Triage");
    expect(page.querySelector("h3")?.textContent).toBe("Chat with Triage");
    expect(page.textContent).toContain("Sorts incoming mail by topic");
    expect(page.textContent).toContain("Model: smart (Triage's)");
    expect(chip(page, "Model:")).toBeUndefined();
    expect(page.querySelector("textarea")?.getAttribute("aria-label")).toBe("Message Triage");
    expect(page.querySelector("textarea")?.getAttribute("placeholder")).toBe("Message Triage…");
    expect(fake.kept().map((chat) => chat.kind)).toEqual(["agent:support/triage", "build"]);
    expect(fake.kept()[1]?.messages).toHaveLength(1);
  });

  it("goes back to an empty Build chat from an agent chat", async () => {
    const page = await show(panel(fakeHost([routine], { models, agents: [triage] })));
    await act(async () => items(page, "Chat with:")[1]?.click());
    await act(async () => items(page, "Chat with:")[0]?.click());
    expect(chip(page, "Chat with:")).toBe("Chat with: Build");
    expect(page.querySelector("h3")?.textContent).toBe("What should we build?");
    expect(buttonNamed(page, "Send")).toBeDefined();
  });
});
