// @vitest-environment jsdom

import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { inboxItems } from "../inbox-items.ts";
import { runAtLimit } from "../plan-limit.test-helper.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentItemCard } from "./agent-item-card.tsx";
import { openCard as openApproval } from "./approval-card.test-helper.tsx";
import { cardClasses } from "./card-parts.tsx";
import { PlanLimitCard } from "./plan-limit-card.tsx";
import { proposal, renderCard as renderProposal } from "./proposal-card.test-helper.tsx";
import { openCard as openWait } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

const now = new Date(2026, 10, 24, 10, 0);

/** The classes on the card's outer section. */
function surfaceOf(root: HTMLElement): string[] {
  return root.querySelector("section")?.className.split(" ") ?? [];
}

function planLimitCard(): HTMLElement {
  const [item] = inboxItems([runAtLimit()]);
  if (item?.kind !== "wait" || item.limit === undefined) throw new Error("expected a limit item");
  return render(
    <PlanLimitCard
      item={{ ...item, limit: item.limit }}
      decisions={{ answer: async () => waitingRun("r43") }}
      next={null}
      now={() => now}
    />,
  );
}

async function agentCard(): Promise<HTMLElement> {
  const messaging = new FakeAgentMessaging({ now: () => now });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const item = messaging.addInboxItem(source.id, { question: "What should the title be?" });
  const [read] = await messaging.listSources();
  const root = render(
    <AgentItemCard
      item={item}
      source={read}
      now={() => now}
      answer={(answer) => messaging.answer(item.id, answer)}
      readAttachment={(attachment) => messaging.readAttachment(attachment)}
    />,
  );
  await act(async () => {});
  return root;
}

verifies("inbox.card-surface", () => {
  it("gives the card surface its background, edge, card radius and lift", () => {
    expect(cardClasses.split(" ")).toEqual(
      expect.arrayContaining(["bg-surface", "border", "border-border", "rounded-md", "shadow-1"]),
    );
  });

  it("lets the whole card grow in a short window so its bar of answers isn't clipped", () => {
    expect(cardClasses.split(" ")).toEqual(
      expect.arrayContaining(["short:min-h-auto", "short:overflow-visible"]),
    );
  });

  it.each([
    ["an approval's", async () => openApproval().root],
    ["a wait step's", async () => openWait().root],
    ["a run proposal's", async () => renderProposal(undefined, proposal(), () => {}).root],
    ["a plan limit's", async () => planLimitCard()],
    ["an agent's", agentCard],
  ])("lifts %s card on that surface", async (_kind, open) => {
    const root = await open();
    expect(surfaceOf(root)).toEqual(cardClasses.split(" "));
  });
});
