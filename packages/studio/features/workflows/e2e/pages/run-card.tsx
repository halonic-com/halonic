import type { RunSummary } from "@halonicjs/events";
import type { RunRow, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RunCard } from "../../src/runs/run-card.tsx";

const start = new Date(2026, 10, 9, 10, 40);
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();

/** A run of Support reply in each state, as the runs feature reads it from a run's log. */
const base: RunSummary = {
  id: "run_mfx3k2a1_01jd8q",
  hubId: "acme",
  workflowId: "reply",
  kind: "run",
  status: "running",
  state: "draft",
  startedAt: at(0),
  endedAt: null,
  usage: { inputTokens: 0, outputTokens: 0 },
  cost: 0.03,
  unpricedCalls: 0,
  subscriptionCalls: 0,
  statesVisited: ["read", "draft"],
  context: {},
  error: null,
  reason: null,
  definitionsVersion: "v1",
  trigger: null,
  parentRunId: null,
  waitingOn: null,
  accepts: [],
  answerLabels: {},
  nextTimer: null,
  waitingFor: null,
  lastWaitingAt: null,
  approvals: [],
  signals: [],
  cantTry: [],
  lastSeq: 7,
  updatedAt: at(2),
};

const states: Record<
  string,
  { readonly chip: RunRow["chip"]; readonly line: string; readonly summary: RunSummary }
> = {
  finished: {
    chip: { word: "Done", tone: "success", dot: false },
    line: "Finished in 2 min",
    summary: { ...base, status: "completed", state: "send", endedAt: at(2) },
  },
  waiting: {
    chip: { word: "Needs you", tone: "warning", dot: true },
    line: "Waiting for you: Approve this reply?",
    summary: {
      ...base,
      status: "waiting",
      accepts: ["approve", "reject"],
      waitingFor: { title: "Approve this reply?", body: "" },
    },
  },
  failed: {
    chip: { word: "Failed", tone: "danger", dot: false },
    line: "Failed in Draft",
    summary: {
      ...base,
      status: "failed",
      endedAt: at(2),
      error: "The model didn't answer",
    },
  },
};

const source = {
  log: async () => [],
  workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
  currency: () => "EUR",
};

/** The run card for the state in the page's `state` query parameter, docked at the right as in the app. */
function Card() {
  const name = new URLSearchParams(location.search).get("state") ?? "finished";
  const state = states[name];
  if (state === undefined) {
    throw new Error(`The run card page has no state "${name}".`);
  }
  const row = {
    id: base.id,
    hubId: "acme",
    workflowId: "reply",
    shortId: "01jd8q",
    chip: state.chip,
    workflow: "Support reply",
    line: state.line,
    startedBy: "A message arrived",
  } as RunRow;
  const run = { summary: state.summary, madeToolCalls: false } satisfies SourcedRun;
  return (
    <div className="flex h-screen justify-end bg-surface text-fg">
      <RunCard
        source={source}
        runs={[run]}
        row={row}
        run={run}
        onClose={() => undefined}
        onOpenLog={() => undefined}
      />
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
