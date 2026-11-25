import { agentAda, agentBo, company, plainTask, testKey } from "./acme-data.test-helper.ts";
import type { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { PaperclipTeamStatus } from "./team-status.ts";

// Answers of `live-runs`, `heartbeat-runs` and `getTask`, recorded from our
// server's Paperclip (25 Nov) with every value replaced by Acme's. Each run keeps
// the text fields the mapping must drop, so the tests can search for them.

/** The time the run tests' clock reads. */
export const runsNow = new Date("2026-11-25T10:00:00.000Z");

/** Today's midnight in UTC: the `since` bound of the tests. */
export const midnight = "2026-11-25T00:00:00.000Z";

/** Text that must never reach a `TeamRun`. */
export const hiddenText = ["made-up stdout", "made-up stderr", "made-up error", "wake: made-up"];

/** Fields Paperclip sends that the mapping must not copy. */
const hidden = {
  stdoutExcerpt: "made-up stdout",
  stderrExcerpt: "made-up stderr",
  error: "made-up error",
  logRef: "made-up/log/ref.ndjson",
  contextSnapshot: { issueId: plainTask, wakeReason: "wake: made-up" },
  currentStatusMessage: "wake: made-up",
};

/** Ada's run on ACME-7, running now. */
export const adaLive = {
  ...hidden,
  id: "r0000000-0000-4000-8000-000000000001",
  companyId: company,
  agentId: agentAda,
  status: "running",
  scopeKind: "issue",
  issueId: plainTask,
  startedAt: "2026-11-25T09:50:00.000Z",
  finishedAt: null,
  createdAt: "2026-11-25T09:49:59.000Z",
  lastOutputAt: "2026-11-25T09:58:00.000Z",
  lastEventAt: "2026-11-25T09:59:00.000Z",
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  costUsd: null,
  execution: { canStop: true, phase: "working" },
};

/** Bo's run, queued, which Paperclip can't stop yet. */
const boQueued = {
  ...adaLive,
  id: "r0000000-0000-4000-8000-000000000002",
  agentId: agentBo,
  status: "queued",
  startedAt: null,
  execution: { canStop: false },
};

/** Ada's earlier run on ACME-7 today, metered. */
export const adaMorning = {
  ...hidden,
  id: "r0000000-0000-4000-8000-000000000003",
  companyId: company,
  agentId: agentAda,
  status: "succeeded",
  scopeKind: "issue",
  issueId: plainTask,
  startedAt: "2026-11-25T08:00:00.000Z",
  finishedAt: "2026-11-25T08:10:00.000Z",
  createdAt: "2026-11-25T07:59:59.000Z",
  lastOutputAt: "2026-11-25T08:09:30.000Z",
  inputTokens: 1000,
  cachedInputTokens: 5000,
  outputTokens: 200,
  costUsd: 0.123,
};

/** Ada's chat-only run today, on a subscription: no task, no money. */
export const adaChat = {
  ...adaMorning,
  id: "r0000000-0000-4000-8000-000000000004",
  scopeKind: "company",
  issueId: null,
  status: "failed",
  startedAt: "2026-11-25T09:00:00.000Z",
  finishedAt: "2026-11-25T09:01:00.000Z",
  costUsd: 0,
};

/** Ada's run from yesterday, before the bound. */
const adaYesterday = {
  ...adaMorning,
  id: "r0000000-0000-4000-8000-000000000005",
  startedAt: "2026-11-24T22:00:00.000Z",
  createdAt: "2026-11-24T22:00:00.000Z",
};

/** Serves the run routes: Ada's and Bo's live runs, Ada's finished ones, and ACME-7. */
export function serveRuns(paperclip: FakePaperclip): FakePaperclip {
  return paperclip
    .on("GET", `/api/companies/${company}/live-runs`, { body: [boQueued, adaLive] })
    .on("GET", `/api/companies/${company}/heartbeat-runs`, {
      // `heartbeat-runs` lists the live run too, and newest first.
      body: [adaLive, adaChat, adaMorning, adaYesterday],
    })
    .on("GET", `/api/issues/${plainTask}`, {
      body: { id: plainTask, identifier: "ACME-7", title: "Ship the site", description: "secret" },
    });
}

/** A run tests' provider on `paperclip`. */
export function connectRuns(paperclip: FakePaperclip): PaperclipTeamStatus {
  return new PaperclipTeamStatus({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    now: () => runsNow,
    fetch: paperclip.fetch,
  });
}
