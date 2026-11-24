import { agentAda, agentBo, company, testKey } from "./acme-data.test-helper.ts";
import type { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { PaperclipTeamStatus } from "./team-status.ts";

// Answers of the architecture note's section 1.5 routes, recorded from our
// server's Paperclip (cost routes, 24 Nov) and from the two plugin routes'
// answer types (seats `GET /seats/summary`, agent-tools `GET /github/summary`
// and `GET /github/pr/{number}`), with every value replaced by Acme's.

/** The time the team status tests' clock reads. */
export const teamNow = new Date("2026-11-24T10:10:00.000Z");

/** The snapshot's own time, which the PR answers carry as `asOf`. */
export const takenAt = "2026-11-24T10:00:00.000Z";

const anthropic = { provider: "anthropic", biller: "anthropic", eventCount: 4 };

/** `costs/summary`: the subscription work cost nothing; $12.34 of metered work. */
export const costsSummary = {
  companyId: company,
  eventCount: 40,
  unpricedEventCount: 0,
  pendingRunCount: 2,
  pricingComplete: false,
  spendCents: 1234.4,
  spendCentsExact: "1234.4000000",
  budgetCents: 50000,
  utilizationPercent: 2,
};

/** `costs/by-provider`: one metered row and one subscription row. */
export const costsByProvider = [
  {
    ...anthropic,
    billingType: "metered_api",
    model: "opus",
    costCents: 1234.4,
    inputTokens: 1000,
    cachedInputTokens: 5000,
    outputTokens: 200,
    subscriptionInputTokens: 0,
  },
  {
    ...anthropic,
    billingType: "subscription_included",
    model: "sonnet",
    costCents: 0,
    inputTokens: 30000,
    cachedInputTokens: 900000,
    outputTokens: 7000,
    subscriptionInputTokens: 30000,
  },
];

/** `costs/by-agent`: Ada works on a subscription only, Bo on metered API. */
export const costsByAgent = [
  {
    agentId: agentAda,
    agentName: "Ada",
    agentStatus: "idle",
    costCents: 0,
    inputTokens: 30000,
    cachedInputTokens: 900000,
    outputTokens: 7000,
    apiRunCount: 0,
    subscriptionRunCount: 12,
    avatarUrl: "https://paperclip.acme.test/avatars/ada.png",
  },
  {
    agentId: agentBo,
    agentName: "Bo",
    agentStatus: "paused",
    costCents: 1234.4,
    inputTokens: 1000,
    cachedInputTokens: 5000,
    outputTokens: 200,
    apiRunCount: 3,
    subscriptionRunCount: 0,
  },
];

/** `costs/by-agent-model`: Ada on two models. */
export const costsByAgentModel = [
  {
    ...anthropic,
    agentId: agentAda,
    billingType: "subscription_included",
    model: "sonnet",
    costCents: 0,
    inputTokens: 20000,
    cachedInputTokens: 600000,
    outputTokens: 5000,
  },
  {
    ...anthropic,
    agentId: agentAda,
    billingType: "subscription_included",
    model: "opus",
    costCents: 0,
    inputTokens: 10000,
    cachedInputTokens: 300000,
    outputTokens: 2000,
  },
  {
    ...anthropic,
    agentId: agentBo,
    billingType: "metered_api",
    model: "opus",
    costCents: 1234.4,
    inputTokens: 1000,
    cachedInputTokens: 5000,
    outputTokens: 200,
  },
];

/** `budgets/overview`: Bo has a $100 monthly budget. */
export const budgetsOverview = {
  companyId: company,
  policies: [
    {
      policyId: "b1",
      companyId: company,
      scopeType: "agent",
      scopeId: agentBo,
      scopeName: "Bo",
      metric: "billed_cents",
      windowKind: "calendar_month_utc",
      amount: 10000,
      status: "ok",
    },
  ],
  activeIncidents: [],
  pausedAgentCount: 0,
};

/** `seats/summary`: one pool seat near its limit, one reserve seat signed out. */
export const seatsSummary = {
  at: takenAt,
  seats: [
    {
      id: "pool-1",
      label: "pool-1",
      role: "pool",
      asOf: "2026-11-24T09:58:00.000Z",
      readable: true,
      windows: [
        {
          kind: "five-hour",
          label: "5-hour window",
          usedPercent: 92,
          resetsAt: "2026-11-24T12:00:00.000Z",
          reaches90At: "2026-11-24T09:40:00.000Z",
        },
        { kind: "week", label: "Week", usedPercent: 40, resetsAt: "2026-11-28T00:00:00.000Z" },
      ],
      agents: [{ agentId: agentAda, name: "Ada" }],
      manualResetUsed: false,
    },
    {
      id: "reserve-1",
      label: "reserve-1",
      role: "reserve",
      readable: false,
      lastError: "signed-out",
      windows: [],
      agents: [],
      manualResetUsed: true,
    },
  ],
  proposal: { text: "Move Ada to reserve-1.", at: takenAt },
};

/** A pull request of the GitHub summary; `changes` replaces fields. */
export function pull(number: number, changes: Record<string, unknown> = {}) {
  return {
    number,
    title: `Change ${number}`,
    author: { kind: "agent", name: "ada" },
    work: "ACME-7",
    state: "open",
    updatedAt: "2026-11-24T08:00:00.000Z",
    mergedAt: null,
    draft: false,
    mergeable: "yes",
    ciOk: "success",
    inQueue: false,
    fastTrack: false,
    approvedBy: [],
    failedCheck: null,
    reviewCounts: null,
    dequeued: null,
    ...changes,
  };
}

/** `github/summary`: one repository, with a queue of one group and one waiting entry. */
export const githubSummary = {
  takenAt,
  repos: [
    {
      repo: "acme/app",
      defaultBranch: "main",
      open: [
        pull(11, { inQueue: true, approvedBy: ["Bo"] }),
        pull(12, { inQueue: true }),
        pull(13, {
          author: { kind: "person", name: "the board" },
          ciOk: "failure",
          failedCheck: "typecheck",
        }),
        pull(14, { author: { kind: "person", name: "outside contributor" }, work: null }),
        pull(15, { dequeued: { at: "2026-11-24T09:00:00.000Z", reason: "group failed" } }),
      ],
      recent: [pull(10, { state: "merged", mergedAt: "2026-11-24T07:00:00.000Z" })],
      queue: [
        {
          number: 11,
          position: 1,
          state: "AWAITING_CHECKS",
          enqueuedAt: "2026-11-24T09:30:00.000Z",
          groupHead: "abc1234",
          estimatedSeconds: 900,
          groupCiOk: null,
          jobsWaiting: 0,
          waitingSince: null,
        },
        {
          number: 12,
          position: 2,
          state: "QUEUED",
          enqueuedAt: "2026-11-24T09:40:00.000Z",
          groupHead: null,
          estimatedSeconds: null,
          groupCiOk: null,
          jobsWaiting: 2,
          waitingSince: "2026-11-24T09:50:00.000Z",
        },
      ],
    },
  ],
  mergeSpeed: {
    hours: 24,
    merges: 8,
    mergesPerHour: 0.3,
    exits: 9,
    dropRate: 0.1,
    medianMinutes: 42,
    longestMinutes: 90,
  },
};

/** `github/pr/13`: the board's pull request with a failing check. */
export const githubPull13 = {
  takenAt,
  repo: "acme/app",
  pull: githubSummary.repos[0]?.open[2],
  failingChecks: ["typecheck"],
  pendingChecks: [],
  approvals: [],
  labels: [],
  queue: null,
};

/** Serves the recorded answers on the section 1.5 routes. */
export function serveTeam(paperclip: FakePaperclip): FakePaperclip {
  const costs = `/api/companies/${company}`;
  return paperclip
    .on("GET", `/api/companies/${company}/agents`, {
      body: [
        { id: agentAda, name: "Ada" },
        { id: agentBo, name: "Bo" },
      ],
    })
    .on("GET", `${costs}/costs/summary`, { body: costsSummary })
    .on("GET", `${costs}/costs/by-provider`, { body: costsByProvider })
    .on("GET", `${costs}/costs/by-agent`, { body: costsByAgent })
    .on("GET", `${costs}/costs/by-agent-model`, { body: costsByAgentModel })
    .on("GET", `${costs}/budgets/overview`, { body: budgetsOverview })
    .on("GET", "/api/plugins/halonic.seats/api/seats/summary", { body: seatsSummary })
    .on("GET", "/api/plugins/halonic.agent-tools/api/github/summary", { body: githubSummary })
    .on("GET", "/api/plugins/halonic.agent-tools/api/github/pr/13", { body: githubPull13 });
}

/** A team status reader for the Acme connection on `paperclip`. */
export function connectTeam(paperclip: FakePaperclip): PaperclipTeamStatus {
  return new PaperclipTeamStatus({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    now: () => teamNow,
    fetch: paperclip.fetch,
  });
}
