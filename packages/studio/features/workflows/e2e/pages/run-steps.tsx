import type { RunEvent, RunEventBody, RunSummary } from "@halonicjs/events";
import { RunsList, type RunsSource, RunView } from "@halonicjs/studio-feature-runs/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The run page of a made-up Review pull request run, for halonic.dev (HAL-10732): Summarise
 * done, the run waiting at "Publish the review?". The names are the site's own, so the picture
 * matches its copy. Studio draws a step only once the run reached it, so Publish isn't listed.
 */

const start = new Date(2026, 10, 9, 10, 40, 0);
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000).toISOString();

const runId = "run_mfx3k2a1_7f3a2b";

const summary: RunSummary = {
  id: runId,
  hubId: "my-notes",
  workflowId: "review-pull-request",
  kind: "run",
  status: "waiting",
  state: "approve",
  startedAt: at(0),
  endedAt: null,
  usage: { inputTokens: 0, outputTokens: 0 },
  cost: 0,
  unpricedCalls: 0,
  subscriptionCalls: 0,
  statesVisited: ["summarise", "approve"],
  context: {},
  error: null,
  reason: null,
  definitionsVersion: "v1",
  trigger: null,
  parentRunId: null,
  waitingOn: null,
  accepts: ["approve", "reject"],
  answerLabels: {},
  nextTimer: null,
  waitingFor: { title: "Publish the review?", body: "" },
  lastWaitingAt: at(41),
  approvals: [],
  signals: [],
  cantTry: [],
  lastSeq: 5,
  updatedAt: at(41),
};

const timed: readonly (readonly [number, RunEventBody])[] = [
  [
    0,
    {
      type: "run.started",
      hubId: "my-notes",
      workflowId: "review-pull-request",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
      version: {
        reads: "live-version",
        commit: "3f2a1c9e5b7d4a60b1c2d3e4f5a6b7c8d9e0f1a2",
        versionDate: at(-3600),
      },
    },
  ],
  [0, { type: "state.entered", state: "summarise" }],
  [41, { type: "state.entered", state: "approve" }],
  [41, { type: "run.waiting", state: "approve", events: ["approve", "reject"] }],
];
const log: RunEvent[] = timed.map(([seconds, body], index) => ({
  ...body,
  runId,
  seq: index + 1,
  at: at(seconds),
}));

const descriptions: Record<string, string> = { approve: "Publish the review?" };

const source: RunsSource = {
  list: async () => [{ summary, madeToolCalls: false }],
  log: async () => log,
  workflow: () => ({ name: "Review pull request", stepDescription: (id) => descriptions[id] }),
  routine: () => undefined,
  runnableWorkflows: async () => ["review-pull-request"],
  currency: () => "EUR",
  providerKind: () => undefined,
  monthlyBudget: () => undefined,
  subscribe: () => () => undefined,
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The run steps page needs its #root element (run-steps.html).");
}
createRoot(root).render(
  <StrictMode>
    {/* The screenshot's frame: Studio's content column wide (or the window, if
        narrower), as tall as its content. */}
    <div id="shot" className="w-full max-w-[1100px] bg-surface text-fg">
      <RunView
        list={new RunsList(source)}
        runId={runId}
        reviewInInbox={() => undefined}
        now={() => new Date(start.getTime() + 60_000)}
      />
    </div>
  </StrictMode>,
);
