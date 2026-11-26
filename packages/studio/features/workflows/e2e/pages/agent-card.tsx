import { AgentItemCard, type AgentItemCardProps } from "@halonicjs/studio-feature-inbox/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The Inbox card of an open question a made-up agent put to the person, from a made-up Paperclip
 * company (HAL-19651): who asks, the work it came from, the question as Markdown, and Approve and
 * Reject. It shows the lifted card surface every item-pane card has since #6502.
 */

const asked = new Date(2026, 10, 26, 9, 15);

const source: AgentItemCardProps["source"] = {
  id: "acme-source",
  provider: "paperclip",
  label: "Paperclip · Acme",
  state: { kind: "online", asOf: asked.toISOString() },
};

const item: AgentItemCardProps["item"] = {
  id: "acme-item-1",
  source: source.id,
  from: { kind: "agent", agent: "acme-agent-robin", name: "Robin" },
  question: [
    "Publish the spring price list?",
    "",
    "The new list raises **three** prices by 5 % and adds the *Garden* range.",
    "",
    "- 42 products change",
    "- It goes live on the shop at once",
  ].join("\n"),
  options: [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ],
  attachments: [],
  work: "acme-work-12",
  createdAt: asked.toISOString(),
  state: { kind: "open" },
};

const work: AgentItemCardProps["work"] = {
  id: "acme-work-12",
  source: source.id,
  label: "ACME-12",
  title: "Spring price list",
  state: "in-review",
  blockedBy: [],
  updatedAt: asked.toISOString(),
};

const agents: AgentItemCardProps["agents"] = [
  {
    id: "acme-agent-robin",
    source: source.id,
    name: "Robin",
    title: "Shop manager",
    activity: "waiting",
  },
];

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The agent card page needs its #root element (agent-card.html).");
}
createRoot(root).render(
  <StrictMode>
    {/* The screenshot's frame: the Inbox pane's width at most, as tall as its content. */}
    <div id="shot" className="w-full max-w-[28rem] bg-surface p-4 text-fg">
      <AgentItemCard
        item={item}
        source={source}
        work={work}
        agents={agents}
        now={() => new Date(asked.getTime() + 12 * 60_000)}
        answer={() => new Promise(() => undefined)}
        readAttachment={() => new Promise(() => undefined)}
      />
    </div>
  </StrictMode>,
);
