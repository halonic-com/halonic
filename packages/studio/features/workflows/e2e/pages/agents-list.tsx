import {
  type AgentListing,
  type AgentsHost,
  loadAgentsPage,
} from "@halonicjs/studio-feature-agents/api";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

/** The Agents list with two groups (hubs), from made-up agents (HAL-11861). */
const hubs = [
  { id: "support", name: "Support" },
  { id: "sales", name: "Sales" },
];
const agents: AgentListing[] = [
  {
    hubId: "support",
    id: "triage",
    name: "Triage",
    description: "Sorts new messages by urgency.",
    model: "smart",
  },
  {
    hubId: "support",
    id: "reply",
    name: "Reply writer",
    description: "Drafts a reply in our voice.",
    model: "default",
  },
  {
    hubId: "sales",
    id: "lead-scout",
    name: "Lead scout",
    description: "Finds companies that fit.",
    model: "fast",
  },
  { hubId: "sales", id: "follow-up", name: "Follow-up", model: "smart" },
];
const host: AgentsHost = {
  hubs: () => hubs,
  list: async () => agents,
  read: async (ref) => {
    const found = agents.find((agent) => agent.hubId === ref.hubId && agent.id === ref.id);
    if (found === undefined) throw new Error("not found");
    return found;
  },
  nameOf: (ref) => agents.find((agent) => agent.hubId === ref.hubId && agent.id === ref.id)?.name,
  referencesTo: async () => [],
  subscribe: () => () => undefined,
  create: async ({ hubId, name }) => ({ hubId, id: name.toLowerCase() }),
};

const AgentsView = lazy(async () => ({ default: (await loadAgentsPage()).AgentsView }));

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The agents list page needs its #root element (agents-list.html).");
}
createRoot(root).render(
  <StrictMode>
    <div className="h-screen bg-surface text-fg">
      <Suspense fallback={null}>
        <AgentsView host={host} />
      </Suspense>
    </div>
  </StrictMode>,
);
