import { type AgentListing, loadAgentScreen } from "@halonicjs/studio-feature-agents/api";
import {
  createToastStore,
  PHONE_MAX_WIDTH,
  PresentationProvider,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { createCloseStack } from "@halonicjs/studio-shell";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { madeUpAgentsHost } from "./made-up-agents.ts";

/**
 * The agent page on Flow, with a card on each side of the map, from made-up agents (HAL-13180). The
 * spec checks the map's panel has room: the unit tests fake the panel's size, so only a browser
 * shows whether it ends up with none. Under 600 px it's the phone presentation, as in the app.
 */
const hubs = [{ id: "support", name: "Support" }];
const agents: AgentListing[] = [
  { hubId: "support", id: "triage", name: "Triage", model: "smart" },
  { hubId: "support", id: "reply", name: "Reply writer", model: "default" },
  { hubId: "support", id: "inbox", name: "Inbox watcher", model: "fast" },
];
const host = madeUpAgentsHost(hubs, agents, {
  subagentsOf: { triage: ["reply"], inbox: ["triage"] },
  settingsOf: {
    triage: {
      instructions: "Sort each new message by urgency.",
      skills: ["tone"],
      knowledge: ["faq"],
      connectors: ["mail"],
      agentSteps: [{ id: "classify", instructions: "Say which queue it goes to." }],
    },
  },
  toolOptions: async () => ({
    skills: [{ id: "tone", name: "Tone" }],
    knowledge: [{ id: "faq", name: "FAQ" }],
    connectors: [{ id: "mail", name: "Acme mail" }],
  }),
  referencesTo: async (ref) =>
    ref.id === "triage"
      ? [{ hubId: "support", id: "support-reply", name: "Support reply", stepIds: ["sort"] }]
      : [],
});

const AgentScreen = lazy(async () => ({ default: (await loadAgentScreen()).AgentScreen }));

const presentation = window.matchMedia(`(width < ${PHONE_MAX_WIDTH}px)`).matches
  ? "phone"
  : "desktop";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The agent map page needs its #root element (agent-map.html).");
}
createRoot(root).render(
  <StrictMode>
    <div className="h-screen bg-surface text-fg">
      <PresentationProvider presentation={presentation}>
        <ToastStoreProvider store={createToastStore()}>
          <Suspense fallback={null}>
            {/* The opens do nothing here; with them the cards are buttons, as in the app. */}
            <AgentScreen
              host={host}
              hubId="support"
              id="triage"
              closeStack={createCloseStack()}
              openAgent={() => {}}
              openWorkflow={() => {}}
              openLibrary={() => {}}
            />
          </Suspense>
        </ToastStoreProvider>
      </PresentationProvider>
    </div>
  </StrictMode>,
);
