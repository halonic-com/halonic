import type { RunSummary } from "@halonicjs/events";
import type { AgentRef, AgentRoutine, AgentUser } from "@halonicjs/studio-feature-agents/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import {
  type HeldAgentsHost,
  newestScheduledRun,
  WorkspaceHeldAgents,
} from "./workspace-held-agents.ts";

const run = (
  id: string,
  startedAt: string,
  extra: { routineId?: string; workflowId?: string; kind?: "run" | "test" } = {},
) =>
  ({
    id,
    kind: extra.kind ?? "run",
    hubId: "acme",
    workflowId: extra.workflowId ?? "agent:writer",
    startedAt,
    trigger:
      extra.routineId === undefined
        ? null
        : { type: "schedule", routineId: extra.routineId, at: startedAt },
  }) as RunSummary;

const daily = (id: string, startedAt: string) => run(id, startedAt, { routineId: "acme/daily" });
const ownRoutine = { routineKeys: new Set(["acme/daily"]), workflows: [] };

type Placement = Awaited<ReturnType<HeldAgentsHost["placement"]>>;
const onHold = (changedAt?: string): Placement => ({
  runsOn: "on-hold",
  fingerprint: "sha256:b",
  ...(changedAt === undefined ? {} : { changedAt }),
  unsaved: false,
  studioStartsUnfenced: true,
});

/** An agents host with Writer and Sorter, each placed and started as a test sets. */
function host(options: {
  placements: Readonly<Record<string, Placement | Error>>;
  routines?: Readonly<Record<string, readonly AgentRoutine[]>>;
  users?: Readonly<Record<string, readonly AgentUser[]>>;
}) {
  const placement = vi.fn(async (ref: AgentRef) => {
    const placed = options.placements[ref.id];
    if (placed instanceof Error) throw placed;
    return placed;
  });
  const agents: HeldAgentsHost = {
    list: async () => [
      { hubId: "acme", id: "writer", name: "Writer" },
      { hubId: "acme", id: "sorter", name: "Sorter" },
    ],
    placement,
    routinesOf: async (ref) => options.routines?.[ref.id] ?? [],
    referencesTo: async (ref) => options.users?.[ref.id] ?? [],
    subscribe: () => () => {},
  };
  return { agents, placement };
}

const runsOf = (summaries: readonly RunSummary[]) => ({
  list: async () => summaries.map((summary) => ({ summary })),
  subscribe: () => () => {},
});

const writerRoutine: AgentRoutine = { hubId: "acme", id: "daily", name: "Daily" };

verifies("studio.held-agents", () => {
  it("finds the newest routine run of the agent's own routine after the hold", () => {
    const runs = [
      daily("early", "2026-11-20T07:00:00.000Z"),
      daily("a", "2026-11-20T09:00:00.000Z"),
      daily("b", "2026-11-20T10:00:00.000Z"),
    ];
    expect(newestScheduledRun(runs, ownRoutine, "2026-11-20T08:00:00.000Z")?.id).toBe("b");
    expect(newestScheduledRun(runs.slice(0, 1), ownRoutine, "2026-11-20T08:00:00.000Z")).toBe(
      undefined,
    );
  });

  it("counts any such run when the time of the change isn't known", () => {
    const runs = [daily("early", "2026-11-20T07:00:00.000Z")];
    expect(newestScheduledRun(runs, ownRoutine, undefined)?.id).toBe("early");
  });

  it("counts a routine's run of a workflow that runs the agent, with the root's routine keys", () => {
    const flow = run("f", "2026-11-20T09:00:00.000Z", {
      routineId: "@workspace/weekly",
      workflowId: "digest",
    });
    const starters = {
      routineKeys: new Set<string>(),
      workflows: [{ hubId: "acme", id: "digest" }],
    };
    expect(newestScheduledRun([flow], starters, undefined)?.id).toBe("f");
    const root = { routineKeys: new Set(["@workspace/weekly"]), workflows: [] };
    expect(newestScheduledRun([flow], root, undefined)?.id).toBe("f");
  });

  it("leaves out a hand-started run, a test run and another routine's run", () => {
    const runs = [
      run("hand", "2026-11-20T09:00:00.000Z"),
      run("test", "2026-11-20T09:00:00.000Z", { routineId: "acme/daily", kind: "test" }),
      run("other", "2026-11-20T09:00:00.000Z", { routineId: "acme/other" }),
    ];
    expect(newestScheduledRun(runs, ownRoutine, undefined)).toBeUndefined();
  });

  it("lists a held agent its routine ran since, with that run's start", async () => {
    const { agents } = host({
      placements: { writer: onHold("2026-11-20T08:00:00.000Z"), sorter: undefined },
      routines: { writer: [writerRoutine], sorter: [writerRoutine] },
    });
    const held = new WorkspaceHeldAgents(agents, runsOf([daily("a", "2026-11-20T09:00:00.000Z")]));
    expect(await held.list()).toEqual([
      { hubId: "acme", id: "writer", name: "Writer", since: "2026-11-20T09:00:00.000Z" },
    ]);
  });

  it("counts an agent whose choice can't be read as not on hold, and keeps the others", async () => {
    const { agents } = host({
      placements: { writer: onHold(), sorter: new Error("can't read the file") },
      routines: { writer: [writerRoutine], sorter: [writerRoutine] },
    });
    const held = new WorkspaceHeldAgents(agents, runsOf([daily("a", "2026-11-20T09:00:00.000Z")]));
    expect((await held.list()).map((agent) => agent.id)).toEqual(["writer"]);
  });

  it("reads no agent's choice when no routine has run anything", async () => {
    const { agents, placement } = host({ placements: { writer: onHold() } });
    const held = new WorkspaceHeldAgents(agents, runsOf([run("hand", "2026-11-20T09:00:00.000Z")]));
    expect(await held.list()).toEqual([]);
    expect(placement).not.toHaveBeenCalled();
  });

  it("passes on the agents host's and the run history's changes, and stops both", () => {
    const stopAgents = vi.fn();
    const stopRuns = vi.fn();
    let agentsListener: (() => void) | undefined;
    let runsListener: (() => void) | undefined;
    const { agents } = host({ placements: {} });
    const held = new WorkspaceHeldAgents(
      {
        ...agents,
        subscribe: (listener) => {
          agentsListener = listener;
          return stopAgents;
        },
      },
      {
        list: async () => [],
        subscribe: (listener) => {
          runsListener = listener;
          return stopRuns;
        },
      },
    );
    const listener = vi.fn();
    const stop = held.subscribe(listener);
    agentsListener?.();
    runsListener?.();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    expect(stopAgents).toHaveBeenCalled();
    expect(stopRuns).toHaveBeenCalled();
  });
});
