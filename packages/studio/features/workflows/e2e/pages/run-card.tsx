import type { RunSummary } from "@halonicjs/events";
import type { RunRow, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RunCard } from "../../src/runs/run-card.tsx";

/** What the card shows for a run in each state: its chip, its line and the steps so far. */
const states = {
  finished: {
    chip: { word: "Done", tone: "success", dot: false },
    line: "Finished in Send",
    steps: ["read", "draft", "send"],
    status: "completed",
  },
  waiting: {
    chip: { word: "Needs you", tone: "warning", dot: true },
    line: "Waiting for you: approve the reply",
    steps: ["read", "draft"],
    status: "waiting",
  },
  failed: {
    chip: { word: "Failed", tone: "danger", dot: false },
    line: "Failed in Draft: the model didn't answer",
    steps: ["read", "draft"],
    status: "failed",
  },
} as const;

/** The run card for the state in the page's `state` query parameter, docked at the right as in the app. */
function Card() {
  const name = new URLSearchParams(location.search).get("state") ?? "finished";
  if (!(name in states)) {
    throw new Error(`The run card page has no state "${name}".`);
  }
  const state = states[name as keyof typeof states];
  const row = {
    id: "run_mfx3k2a1_01jd8q",
    hubId: "acme",
    workflowId: "reply",
    shortId: "01jd8q",
    chip: state.chip,
    workflow: "Support reply",
    line: state.line,
    startedBy: "A message arrived",
  } as RunRow;
  const run = {
    summary: { statesVisited: [...state.steps], status: state.status } as RunSummary,
    madeToolCalls: false,
  } satisfies SourcedRun;
  return (
    <div className="flex h-screen justify-end bg-surface text-fg">
      <RunCard row={row} run={run} onClose={() => undefined} onOpenLog={() => undefined} />
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The run card page needs its #root element (run-card.html).");
}
createRoot(root).render(
  <StrictMode>
    <Card />
  </StrictMode>,
);
