// @vitest-environment jsdom
import {
  createShell,
  defineFeature,
  type ServiceKey,
  type ServiceTarget,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AiChatsService, AssistantHostService } from "../api.ts";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { assistantFeature } from "../feature.ts";
import {
  chatOf,
  fakeHost,
  hostContextOf,
  show,
  triageQuestion,
  unmount,
} from "../test-support.tsx";
import { aiChats } from "./ai-chats.tsx";

afterEach(unmount);

/**
 * A stand-in for the Home feature: like the real one, it lists `AiChatsService` but not the
 * Assistant's host, so the shell's lookup refuses it the host.
 */
const home = defineFeature({ id: "home", title: "Home", wants: [AiChatsService], register() {} });

/** The Home feature's context in the app's shell for one open workspace, with the Assistant's host. */
function homeContext(fake: ReturnType<typeof fakeHost>): WorkspaceContext {
  const shell = createShell({
    features: [assistantFeature, home],
    hostServices: [AssistantHostService],
  });
  const services = new Map<string, unknown>([[AssistantHostService.name, fake.host]]);
  const target: ServiceTarget = {
    provide: (key, service) => services.set(key.name, service),
    get: <Service,>(key: ServiceKey<Service>) => services.get(key.name) as Service,
    has: (key) => services.has(key.name),
  };
  shell.services.instantiate(target);
  return { ...shell.services.contextFor("home", target), openItem: vi.fn() } as WorkspaceContext;
}

function triageHost() {
  return fakeHost([
    chatOf("triage", triageQuestion, "Triage"),
    chatOf("digest", triageQuestion, "Digest"),
  ]);
}

verifies("assistant.home.chats", () => {
  it("lists the Build chats with a message, newest message first, and no agent chat", async () => {
    const fake = fakeHost([
      { ...chatOf("older", triageQuestion, "Triage"), lastUsedAt: "2026-11-20T09:00:00.000Z" },
      { ...chatOf("agent", triageQuestion, "Ask Ada"), kind: "agent:acme/ada" },
      { ...chatOf("newer", triageQuestion, "Digest"), lastUsedAt: "2026-11-26T09:00:00.000Z" },
      chatOf("draft"),
    ]);
    const chats = await aiChats.list(hostContextOf(fake));
    expect(chats.map((chat) => chat.title)).toEqual(["Digest", "Triage"]);
  });

  it("starts a new chat and only resolves to its id, leaving where it shows to Home", async () => {
    const fake = fakeHost();
    const chatId = await aiChats.newChat(hostContextOf(fake));
    const chats = buildChatsOf(fake.host);
    expect(fake.kept().map((chat) => chat.id)).toContain(chatId);
    expect(chats.inTab(chatId)).toBe(false);
    expect(chats.home.held()).toBeUndefined();
  });

  it("takes a chat Home opens out of the side panel, and Ctrl+Alt+I opens another", async () => {
    const fake = triageHost();
    const chats = buildChatsOf(fake.host);
    await chats.pick("triage");
    aiChats.open("triage", hostContextOf(fake));
    expect(chats.shown().kind).toBe("none");
    await chats.open();
    const shown = chats.shown();
    expect(shown.kind === "chat" && shown.view.chat.id).toBe("digest");
  });

  it("gives the chat back as an ordinary panel chat once Home lets go", async () => {
    const fake = triageHost();
    const chats = buildChatsOf(fake.host);
    const release = aiChats.open("triage", hostContextOf(fake));
    release();
    expect(chats.home.held()).toBeUndefined();
    await chats.pick("triage");
    const shown = chats.shown();
    expect(shown.kind === "chat" && shown.view.chat.id).toBe("triage");
  });

  it("tells Home when its chat is shown in the panel, opened as a tab or deleted", async () => {
    for (const elsewhere of ["panel", "tab", "deleted"] as const) {
      const fake = triageHost();
      const context = hostContextOf(fake);
      const chats = buildChatsOf(fake.host);
      const onLeave = vi.fn();
      aiChats.open("triage", context);
      await show(aiChats.render("triage", context, onLeave));
      await act(async () => {
        if (elsewhere === "panel") await chats.pick("triage");
        if (elsewhere === "tab") chats.moveToTab("triage");
        if (elsewhere === "deleted") await chats.deleteChat("triage");
      });
      expect(onLeave, elsewhere).toHaveBeenCalledOnce();
      unmount();
    }
  });

  it("draws the chat with its title and box, without Continue in the side panel", async () => {
    const fake = triageHost();
    const context = hostContextOf(fake);
    aiChats.open("triage", context);
    const pane = await show(aiChats.render("triage", context, () => {}));
    expect(pane.querySelector("h2")?.textContent).toBe("Triage");
    expect(pane.querySelector("textarea")).not.toBeNull();
    expect(pane.textContent).not.toContain("Continue in the side panel");
  });

  it("opens the chat as its tab next to the active one", () => {
    const fake = triageHost();
    const context = hostContextOf(fake);
    aiChats.openInTab("triage", context);
    expect(buildChatsOf(fake.host).inTab("triage")).toBe(true);
    expect(context.openItemInNewTab).toHaveBeenCalledWith(chatTabItem("triage"));
  });

  it("tells the listener when the list changes, not when the engine does, until it stops", async () => {
    const fake = fakeHost();
    const listener = vi.fn();
    const stop = aiChats.subscribe(hostContextOf(fake), listener);
    await fake.setEngineAnswering(false);
    expect(listener).not.toHaveBeenCalled();
    await fake.host.newChat("build");
    expect(listener).toHaveBeenCalledOnce();
    stop();
    await fake.host.newChat("build", { kind: "workflow", hub: "acme", id: "triage" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("lists and draws the chats under the Home feature's lookup, which can't reach the host", async () => {
    const context = homeContext(triageHost());
    expect(() => context.services.get(AssistantHostService)).toThrow(/doesn't list it/);
    const service = context.services.get(AiChatsService);
    expect((await service.list(context)).map((chat) => chat.id)).toEqual(["triage", "digest"]);
    service.open("triage", context);
    const pane = await show(service.render("triage", context, () => {}));
    expect(pane.querySelector("textarea")).not.toBeNull();
  });
});
