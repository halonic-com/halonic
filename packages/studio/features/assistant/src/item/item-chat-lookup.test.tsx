// @vitest-environment jsdom
import {
  createShell,
  defineFeature,
  type ServiceKey,
  type ServiceTarget,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantHostService, ItemChatService, ShowInChatService } from "../api.ts";
import { buildChatsOf } from "../chat/build-chats.ts";
import { assistantFeature } from "../feature.ts";
import { fakeHost, show, unmount } from "../test-support.tsx";

afterEach(unmount);

/**
 * Stand-ins for the features that use the Assistant: like the real workflows, library and agents
 * features (apps/studio's show-in-chat-features test checks this), they list the Assistant's
 * services but not its host, so the shell's lookup refuses them the host.
 */
const workflows = defineFeature({
  id: "workflows",
  title: "Workflows",
  wants: [ItemChatService, ShowInChatService],
  register() {},
});
const library = defineFeature({
  id: "library",
  title: "Library",
  wants: [ItemChatService],
  register() {},
});

/** The app's shell for one open workspace, with the Assistant's host in it. */
function workspace(fake: ReturnType<typeof fakeHost>) {
  const shell = createShell({
    features: [assistantFeature, workflows, library],
    hostServices: [AssistantHostService],
  });
  const services = new Map<string, unknown>([[AssistantHostService.name, fake.host]]);
  const target: ServiceTarget = {
    provide: (key, service) => services.set(key.name, service),
    get: <Service,>(key: ServiceKey<Service>) => services.get(key.name) as Service,
    has: (key) => services.has(key.name),
  };
  shell.services.instantiate(target);
  const panelWindow = { isOpen: () => false, show: vi.fn(), hide: vi.fn(), toggle: vi.fn() };
  const contextOf = (featureId: string) =>
    ({
      ...shell.services.contextFor(featureId, target),
      openItem: vi.fn(),
      panelWindow,
    }) as WorkspaceContext;
  return { contextOf, panelWindow };
}

const triage = { kind: "workflow", hub: "acme", id: "triage" } as const;
const summarize = { kind: "skill", hub: "acme", id: "summarize" } as const;

verifies("assistant.chat.item-page", () => {
  it("draws the chat on a workflow's page under the workflows feature's lookup", async () => {
    const { contextOf } = workspace(fakeHost());
    const context = contextOf("workflows");
    expect(() => context.services.get(AssistantHostService)).toThrow(/doesn't list it/);

    const itemChat = context.services.get(ItemChatService);
    const page = await show(itemChat.chatFor(triage, "Triage", context).render(() => {}, true));

    expect(page.querySelector("textarea")).not.toBeNull();
  });
});

verifies("assistant.chat.ask-about", () => {
  it("opens a chat about a skill under the library feature's lookup", async () => {
    const fake = fakeHost();
    const { contextOf, panelWindow } = workspace(fake);
    const context = contextOf("library");

    await context.services.get(ItemChatService).askAbout(summarize, "Summarize", context);

    const shown = buildChatsOf(fake.host).shown();
    expect(shown.kind === "chat" && shown.view.chat.about).toEqual(summarize);
    expect(panelWindow.show).toHaveBeenCalledOnce();
  });
});

verifies("assistant.chat.show-in-chat", () => {
  it("shows a workflow in the chat under the workflows feature's lookup", async () => {
    const { contextOf, panelWindow } = workspace(fakeHost());
    const context = contextOf("workflows");

    await context.services.get(ShowInChatService).show({ item: triage, name: "Triage" }, context);

    expect(panelWindow.show).toHaveBeenCalledOnce();
  });
});
