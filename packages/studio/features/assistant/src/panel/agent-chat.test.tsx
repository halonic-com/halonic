// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ChatAgent } from "../api.ts";
import type { ChatView } from "../chat/build-chats.ts";
import {
  chatOf,
  fakeHost,
  installFakePopover,
  sendMessage,
  show,
  unmount,
} from "../test-support.tsx";
import { agentStateOf } from "./agent-chat.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

let removePopover: () => void = () => {};
beforeAll(() => {
  removePopover = installFakePopover();
});
afterAll(() => removePopover());
afterEach(() => unmount());

const triage: ChatAgent = {
  kind: "agent:support/triage",
  name: "Triage",
  description: "Sorts incoming mail by topic",
  model: "smart",
  colors: ["#3B82F6", "#8B5CF6"],
};
const routine = chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine");
const triageChat = { ...chatOf("c2"), kind: triage.kind };

function panel(fake: ReturnType<typeof fakeHost>) {
  const services = { get: () => fake.host, find: () => fake.host };
  const context = { services, announcer: { announce: vi.fn() } } as unknown as WorkspaceContext;
  return <AssistantPanel context={context} title="Assistant" onClose={() => {}} />;
}

const orbs = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>(".agent-orb")];

function chatWithMenu(page: HTMLElement) {
  const trigger = [...page.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith("Chat with:"),
  );
  return document.getElementById(trigger?.getAttribute("popovertarget") ?? "") as HTMLElement;
}

/** The panel on a new chat with Triage, picked in Chat with. */
async function triagePanel(fake: ReturnType<typeof fakeHost>) {
  const page = await show(panel(fake));
  const item = chatWithMenu(page).querySelectorAll<HTMLElement>('[role^="menuitem"]')[1];
  await act(async () => item?.click());
  return page;
}

function viewOf(view: Partial<ChatView>): ChatView {
  return {
    chat: triageChat,
    messages: [{ role: "user", content: "Sort this" }],
    answering: true,
    tool: undefined,
    ends: new Map(),
    stoppedByYou: false,
    shown: [],
    ...view,
  };
}

verifies("assistant.chat.agent-orb", () => {
  it("shows each agent's 16px orb in its own colours in the Chat with menu", async () => {
    const page = await show(panel(fakeHost([routine], { agents: [triage] })));
    const [orb] = orbs(chatWithMenu(page));
    expect(orb?.dataset["size"]).toBe("16");
    expect(orb?.style.getPropertyValue("--orb-a")).toBe("#3B82F6");
    expect(orb?.style.getPropertyValue("--orb-b")).toBe("#8B5CF6");
  });

  it("shows an empty agent chat's 64px orb and its orb, name and state at the top", async () => {
    const page = await triagePanel(fakeHost([routine], { agents: [triage] }));
    const sizes = orbs(page).map((orb) => orb.dataset["size"]);
    expect(sizes).toEqual(expect.arrayContaining(["24", "64"]));
    expect(page.querySelector("h3")?.textContent).toBe("Chat with Triage");
    const top = page.querySelector('.agent-orb[data-size="24"]')?.parentElement;
    expect(top?.textContent).toBe("Triage idle");
  });

  it("shows no orb in an empty Build chat", async () => {
    const page = await show(panel(fakeHost([chatOf("c3")], { agents: [triage] })));
    expect(page.querySelector("h3")?.textContent).toBe("What should we build?");
    expect(orbs(page).filter((orb) => !chatWithMenu(page).contains(orb))).toEqual([]);
  });

  it("says thinking with a dashed ring while the agent answers with no text yet", async () => {
    const fake = fakeHost([routine], { agents: [triage] });
    const page = await triagePanel(fake);
    await sendMessage(page, "Sort this");
    const orb = page.querySelector<HTMLElement>('.agent-orb[data-size="24"]');
    expect(orb?.dataset["state"]).toBe("think");
    expect(orb?.parentElement?.textContent).toBe("Triage thinking…");
    await fake.finish({ messages: [], end: { reason: "answered" } } as never);
  });

  it("says which tool runs, then replying once the reply has text, else idle", () => {
    const tool = { id: "call-1", name: "acme-mail__send_reply", arguments: {} };
    expect(agentStateOf(viewOf({ tool }))).toEqual({ state: "tool", words: "using send reply…" });
    const replying = viewOf({
      messages: [
        { role: "user", content: "Sort this" },
        { role: "assistant", content: "It's about billing." },
      ],
    });
    expect(agentStateOf(replying)).toEqual({ state: "talk", words: "replying…" });
    expect(agentStateOf(viewOf({ answering: false }))).toEqual({ state: "idle", words: "idle" });
  });
});
