import type { RunEvent, RunEventBody, RunSummary } from "@halonicjs/events";
import {
  type AllRunsFeed,
  type AllRunsRow,
  RunsAppView,
  RunsList,
  type RunsSource,
  RunView,
} from "@halonicjs/studio-feature-runs/api";
import { framedPanelClass, NarrowProvider } from "@halonicjs/studio-kit";
import { engineWordsOf } from "@halonicjs/studio-shell";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The Runs page in the two-column layout (`runs.list-column`, HAL-20729): the Runs app's list of
 * made-up Acme runs and the content pane beside it. `?narrow=1` draws it in one pane, as on a
 * phone. The spec clicks "Support reply" to open its run, which waits at "Send the reply?".
 */

const start = new Date(2026, 10, 25, 9, 40, 0);
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000).toISOString();
const runId = "run_mfx3k2a1_7f3a2b";

const summary: RunSummary = {
  id: runId,
  hubId: "acme",
  workflowId: "support-reply",
  kind: "run",
  status: "waiting",
  state: "approve",
  startedAt: at(0),
  endedAt: null,
  usage: { inputTokens: 0, outputTokens: 0 },
  cost: 0,
  unpricedCalls: 0,
  subscriptionCalls: 0,
  statesVisited: ["draft", "approve"],
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
  waitingFor: { title: "Send the reply?", body: "" },
  lastWaitingAt: at(41),
  approvals: [],
  signals: [],
  cantTry: [],
  lastSeq: 4,
  updatedAt: at(41),
};

const timed: readonly (readonly [number, RunEventBody])[] = [
  [
    0,
    {
      type: "run.started",
      hubId: "acme",
      workflowId: "support-reply",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
    },
  ],
  [0, { type: "state.entered", state: "draft" }],
  [41, { type: "state.entered", state: "approve" }],
  [41, { type: "run.waiting", state: "approve", events: ["approve", "reject"] }],
];
const log: RunEvent[] = timed.map(([seconds, body], index) => ({
  ...body,
  runId,
  seq: index + 1,
  at: at(seconds),
}));

const source: RunsSource = {
  list: async () => [{ summary, madeToolCalls: false }],
  log: async () => log,
  workflow: () => ({
    name: "Support reply",
    stepDescription: (id) => (id === "approve" ? "Send the reply?" : undefined),
  }),
  routine: () => undefined,
  runnableWorkflows: async () => [],
  currency: () => "EUR",
  providerKind: () => undefined,
  monthlyBudget: () => undefined,
  subscribe: () => () => undefined,
};

function row(id: string, fields: Omit<AllRunsRow, "id" | "lineage" | "notice">): AllRunsRow {
  return { id, lineage: id, notice: { startedByMe: false }, ...fields };
}

const rows: readonly AllRunsRow[] = [
  row(runId, {
    phase: "needs-you",
    startedAt: at(0),
    cost: { kind: "money", currency: "EUR", minorUnits: 4 },
    title: "Support reply",
    line: "Waiting for you · Send the reply?",
    where: "Acme Ops",
    by: { kind: "workflow" },
    chip: { word: "Needs you", tone: "warning", dot: true },
    label: "Support reply, needs you.",
    item: { kind: "run", hub: "acme", id: runId },
  }),
  row("agent-1", {
    phase: "failed",
    startedAt: at(-1800),
    cost: { kind: "tokens", tokens: 1200 },
    title: "Ada · CTO",
    line: "ACME-7 Fix the login · Stopped: no answer",
    where: "Paperclip · Acme",
    by: { kind: "agent", name: "Ada" },
    chip: { word: "Failed", tone: "danger" },
    label: "Ada, failed.",
  }),
  row("run-done", {
    phase: "succeeded",
    startedAt: at(-7200),
    cost: { kind: "money", currency: "EUR", minorUnits: 7 },
    title: "Weekly report",
    line: "Finished",
    where: "Acme Ops",
    by: { kind: "workflow" },
    chip: { word: "Done", tone: "success" },
    label: "Weekly report, finished.",
    item: { kind: "run", hub: "acme", id: "run-done" },
  }),
];

const feed: AllRunsFeed = {
  state: { rows, failures: [], loaded: true, error: undefined },
  subscribe: () => () => undefined,
  refresh: async () => undefined,
};
const list = new RunsList(source);
const now = () => new Date(start.getTime() + 60_000);
const narrow = new URLSearchParams(location.search).get("narrow") === "1";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The Runs page needs its #root element (runs-page.html).");
}
createRoot(root).render(
  <StrictMode>
    {/* The screenshot's frame: the window's frame with Studio's framed panel on it, as the
        shell draws a page. */}
    <div className="flex h-screen bg-canvas p-2 text-fg">
      <div id="shot" className={`flex min-h-0 min-w-0 flex-1 ${framedPanelClass("studio")}`}>
        <NarrowProvider narrow={narrow}>
          <RunsAppView
            feed={feed}
            engine={engineWordsOf({})}
            now={now}
            timeZone="Europe/Amsterdam"
            runPane={(item) => <RunView key={item.id} list={list} runId={item.id} now={now} />}
          />
        </NarrowProvider>
      </div>
    </div>
  </StrictMode>,
);
