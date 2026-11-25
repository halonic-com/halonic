import { ServiceRegistry } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { AgentMessaging, MessagingSource, TeamRun, TeamRuns } from "@halonicjs/ports";
import {
  AllRunsService,
  type RunsSource,
  RunsSourceService,
} from "@halonicjs/studio-feature-runs/api";
import {
  type AgentActivity,
  AgentActivityService,
  AgentMessagingService,
} from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { allRunsWatchKey, provideAllRuns, teamsListName } from "./all-runs-sources.ts";

const now = new Date("2026-11-25T15:00:00Z");

function summary(id: string, startedAt: string, changes: Partial<RunSummary> = {}): RunSummary {
  return {
    id,
    hubId: "acme",
    workflowId: "support-reply",
    kind: "run",
    status: "completed",
    state: null,
    startedAt,
    endedAt: startedAt,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: ["reply"],
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
    updatedAt: startedAt,
    ...changes,
  };
}

function runsSource(summaries: readonly RunSummary[]): RunsSource {
  return {
    list: async () => summaries.map((each) => ({ summary: each })),
    log: async () => [],
    workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
    routine: () => undefined,
    runnableWorkflows: async () => [],
    providerKind: () => undefined,
    currency: () => "EUR",
    monthlyBudget: () => undefined,
    subscribe: () => () => undefined,
  };
}

const acme: MessagingSource = {
  id: "paperclip:acme",
  provider: "paperclip",
  label: "Paperclip · Acme",
  state: { kind: "online", asOf: "2026-11-25T14:59:00Z" },
};
const globex: MessagingSource = { ...acme, id: "paperclip:globex", label: "Paperclip · Globex" };

function teamRun(id: string, source: string, startedAt: string): TeamRun {
  return {
    id,
    source,
    agent: `${source}:agent:ada`,
    task: { id: `${source}:task:7`, identifier: "ACME-7", title: "Fix the login" },
    state: "succeeded",
    startedAt,
    canStop: false,
  };
}

function teamRuns(source: string, runs: readonly TeamRun[]): TeamRuns {
  return { source, runs, complete: true, asOf: "2026-11-25T14:59:00Z" };
}

function studioWith(options: {
  readonly workspace: readonly RunSummary[];
  readonly runs: AgentActivity["runs"];
  readonly sources?: AgentMessaging["listSources"];
}) {
  const services = new ServiceRegistry();
  services.provide(RunsSourceService, runsSource(options.workspace));
  services.provide(AgentActivityService, { runs: options.runs, pullRequests: async () => [] });
  services.provide(AgentMessagingService, {
    listSources: options.sources ?? (async () => [acme, globex]),
    listAgents: async () => [
      {
        id: "paperclip:acme:agent:ada",
        source: acme.id,
        name: "Ada",
        title: "CTO",
        activity: "idle",
      },
    ],
  } as unknown as AgentMessaging);
  provideAllRuns(services, "Acme Ops", () => now);
  return services;
}

verifies("services.all-runs", () => {
  describe("provideAllRuns", () => {
    it("merges a workspace's runs and two teams' runs newest first, as the Runs app's rows", async () => {
      const runs = vi.fn(async () => [
        teamRuns(acme.id, [teamRun("a1", acme.id, "2026-11-25T11:00:00Z")]),
        teamRuns(globex.id, [
          teamRun("g1", globex.id, "2026-11-25T13:00:00Z"),
          teamRun("g2", globex.id, "2026-11-25T08:00:00Z"),
        ]),
      ]);
      const services = studioWith({
        workspace: [
          summary("w1", "2026-11-25T09:00:00Z"),
          summary("w2", "2026-11-25T12:00:00Z", { cost: 0.04 }),
          summary("t1", "2026-11-25T14:00:00Z", { kind: "test" }),
        ],
        runs,
      });
      const all = services.get(AllRunsService);
      await all.refresh();

      expect(all.state.rows.map((row) => [row.id, row.where])).toEqual([
        ["g1", "Paperclip · Globex"],
        ["w2", "Acme Ops"],
        ["a1", "Paperclip · Acme"],
        ["w1", "Acme Ops"],
        ["g2", "Paperclip · Globex"],
      ]);
      expect(all.state.rows[1]).toMatchObject({
        title: "Support reply",
        chip: { word: "Done", tone: "success" },
        cost: { kind: "money", currency: "EUR", minorUnits: 4 },
        item: { kind: "run", hub: "acme", id: "w2" },
      });
      expect(all.state.rows[2]).toMatchObject({
        title: "Ada · CTO",
        line: "ACME-7 Fix the login",
        phase: "succeeded",
        lineage: "paperclip:acme:task:7",
      });
      // One read of the teams' runs for both teams, since midnight UTC 30 days back.
      expect(runs).toHaveBeenCalledTimes(1);
      expect(runs).toHaveBeenCalledWith({ since: "2026-10-26T00:00:00.000Z" });
      await services.dispose();
    });

    it("keeps the other rows and marks a team's error when its runs can't be read", async () => {
      const error = new Error("Paperclip · Globex didn't answer");
      const services = studioWith({
        workspace: [summary("w1", "2026-11-25T09:00:00Z")],
        runs: async () => {
          throw error;
        },
        sources: async () => [acme],
      });
      const all = services.get(AllRunsService);
      await all.refresh();

      expect(all.state.rows.map((row) => row.id)).toEqual(["w1"]);
      expect(all.state.failures).toEqual([
        { source: { id: acme.id, name: "Paperclip · Acme" }, error },
      ]);
      await services.dispose();
    });

    it("shows the workspace's runs and says why when the teams can't be listed", async () => {
      const error = new Error("The agent host isn't answering");
      const services = studioWith({
        workspace: [summary("w1", "2026-11-25T09:00:00Z")],
        runs: async () => [],
        sources: async () => {
          throw error;
        },
      });
      const all = services.get(AllRunsService);
      await all.refresh();

      expect(all.state.rows.map((row) => row.id)).toEqual(["w1"]);
      expect(all.state.failures).toEqual([{ source: { id: "teams", name: teamsListName }, error }]);
      await services.dispose();
    });

    it("provides nothing without an agent host, so the Runs page keeps the workspace's own list", () => {
      const services = new ServiceRegistry();
      services.provide(RunsSourceService, runsSource([]));
      provideAllRuns(services, "Acme Ops");
      expect(services.has(AllRunsService)).toBe(false);
      expect(services.has(allRunsWatchKey)).toBe(false);
    });
  });
});
