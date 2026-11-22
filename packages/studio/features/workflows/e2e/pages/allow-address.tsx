import type { RunEvent, RunEventBody, RunSummary } from "@halonicjs/events";
import {
  type KeyAddressQuestion,
  loadAllowAddressDialog,
} from "@halonicjs/studio-feature-models/api";
import { RunsList, type RunsSource, RunView } from "@halonicjs/studio-feature-runs/api";
import { PHONE_MAX_WIDTH, PresentationProvider } from "@halonicjs/studio-kit";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

/*
 * "Allow this address?" (HAL-11873, HAL-15873) over the run that asks it: a made-up Draft reply
 * run whose model call would send the key "gateway-key" to an address that isn't on the key's
 * list, so its step shows "Waiting for your answer", and the Models feature's dialog asks it.
 * Nothing answers: the person hasn't decided yet. `?dialog=none` leaves the dialog out, for the
 * step on its own. Under 600 px it's the phone presentation, as in the app, so the buttons stack.
 */

const start = new Date(2026, 10, 22, 9, 30, 0);
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000).toISOString();

const runId = "run_mgk2p4c8_1d9e4f";

const question: KeyAddressQuestion = {
  provider: "Gateway",
  key: "gateway-key",
  origin: "https://gateway.example.com",
  allowed: ["https://api.example.com"],
};

const summary: RunSummary = {
  id: runId,
  hubId: "acme",
  workflowId: "draft-reply",
  kind: "run",
  status: "running",
  state: "draft",
  startedAt: at(0),
  endedAt: null,
  usage: { inputTokens: 0, outputTokens: 0 },
  cost: 0,
  unpricedCalls: 0,
  subscriptionCalls: 0,
  statesVisited: ["draft"],
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
  lastSeq: 3,
  updatedAt: at(4),
};

const timed: readonly (readonly [number, RunEventBody])[] = [
  [
    0,
    {
      type: "run.started",
      hubId: "acme",
      workflowId: "draft-reply",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
      version: {
        reads: "live-version",
        commit: "8b1e4c2d7f9a3e5b6c0d1e2f3a4b5c6d7e8f9a0b",
        versionDate: at(-3600),
      },
    },
  ],
  [0, { type: "state.entered", state: "draft" }],
  [4, { type: "key-origin.asked", ...question }],
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
  workflow: () => ({ name: "Draft reply", stepDescription: () => "Draft a reply" }),
  routine: () => undefined,
  runnableWorkflows: async () => [],
  currency: () => "EUR",
  providerKind: () => undefined,
  monthlyBudget: () => undefined,
  subscribe: () => () => undefined,
};

const AllowAddressDialog = lazy(async () => ({
  default: (await loadAllowAddressDialog()).AllowAddressDialog,
}));
const phone = matchMedia(`(width < ${PHONE_MAX_WIDTH}px)`).matches;
const withDialog = new URLSearchParams(location.search).get("dialog") !== "none";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The Allow this address page needs its #root element (allow-address.html).");
}
createRoot(root).render(
  <StrictMode>
    <PresentationProvider presentation={phone ? "phone" : "desktop"}>
      <div id="shot" className="w-full max-w-[1100px] bg-surface text-fg">
        <RunView
          list={new RunsList(source)}
          runId={runId}
          reviewInInbox={() => undefined}
          now={() => new Date(start.getTime() + 20_000)}
        />
      </div>
      {withDialog && (
        <Suspense fallback={null}>
          <AllowAddressDialog
            shown={{ id: 1, question, position: 1, count: 1, saving: false, saveFailed: false }}
            onAllow={() => undefined}
            onRefuse={() => undefined}
          />
        </Suspense>
      )}
    </PresentationProvider>
  </StrictMode>,
);
