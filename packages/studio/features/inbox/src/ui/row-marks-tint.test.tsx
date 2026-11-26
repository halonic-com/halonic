// @vitest-environment jsdom
import type { InboxItem as AgentItem } from "@halonicjs/ports";
import { agentTint } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import type { WaitItem } from "../inbox-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentItemCard } from "./agent-item-card.tsx";
import { agentMark, itemMark } from "./row-marks.tsx";

afterEach(unmountAll);

const fromChief: AgentItem = {
  id: "item-1",
  source: "acme",
  from: { kind: "agent", agent: "agent-chief", name: "Chief" },
  question: "Ship the release notes?",
  options: [],
  attachments: [],
  createdAt: "2026-11-26T09:00:00.000Z",
  state: { kind: "open" },
};

const tints = /\bbg-agent-[a-z]+\b/g;

verifies("inbox.agent-mark-tint", () => {
  it("draws an agent's initials on the tint the Messenger gives that agent's ID", () => {
    const container = render(agentMark(fromChief).avatar);
    expect(container.textContent).toBe("C");
    expect(container.innerHTML.match(tints)).toEqual([agentTint("agent-chief")]);
  });

  it("keeps a question from someone who isn't an agent, and an item's own mark, neutral", () => {
    const fromPerson: AgentItem = { ...fromChief, from: { kind: "person", name: "Ada" } };
    const wait = { kind: "wait" } as WaitItem;
    const container = render(
      <>
        {agentMark(fromPerson).avatar}
        {itemMark(wait).avatar}
      </>,
    );
    expect(container.innerHTML.match(tints)).toBeNull();
  });

  it("draws the open item's header picture on the same tint as its row", async () => {
    const asked = new Date(2026, 10, 26, 9, 0);
    const messaging = new FakeAgentMessaging({ now: () => asked });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    const item = messaging.addInboxItem(source.id, {
      question: "Ship the release notes?",
      from: { kind: "agent", agent: "agent-chief", name: "Chief" },
    });
    const [read] = await messaging.listSources();
    const container = render(
      <AgentItemCard
        item={item}
        source={read}
        now={() => asked}
        answer={(answer) => messaging.answer(item.id, answer)}
        readAttachment={(attachment) => messaging.readAttachment(attachment)}
      />,
    );
    expect(container.innerHTML.match(tints)).toEqual([agentTint("agent-chief")]);
  });
});
