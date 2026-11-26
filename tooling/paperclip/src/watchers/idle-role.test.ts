import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { now } from "../fast-track/fast-track.test-helper.ts";
import { fakeHost, fakeJobContext } from "../plugin/fake-host.test-helper.ts";
import type { TaskRow } from "../pr-watcher/paperclip.ts";
import { defaultRoles } from "../routing.ts";
import {
  emptyIdleRole,
  type IdleRole,
  type IdleRoleState,
  idleRolePass,
  idleRoleText,
  type RoleAgent,
  roleHolders,
} from "./idle-role.ts";
import { runMergeWatchers, type WatchersSettings } from "./run.ts";

function at(minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

/** Every role holder from the shared source, live, with no run yet. */
function holders(changes: Record<string, Partial<RoleAgent>> = {}): RoleAgent[] {
  return [...roleHolders(undefined).keys()].map((key) => ({
    id: `agent-${key}`,
    urlKey: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    status: "idle",
    lastHeartbeatAt: null,
    ...changes[key],
  }));
}

const routine = defaultRoles["routine-reviewer"];
const routineId = `agent-${routine}`;
// Everyone but the routine reviewer holds a task, so only the routine reviewer can be idle.
const busy = new Set(holders().flatMap((agent) => (agent.urlKey === routine ? [] : [agent.id])));

/** Runs passes at the given minutes, each with what `inputAt` gives, and returns each pass's reports. */
function passes(
  minutes: readonly number[],
  inputAt: (minute: number) => { agents: RoleAgent[]; assigned: ReadonlySet<string> },
): IdleRole[][] {
  let state: IdleRoleState = emptyIdleRole;
  return minutes.map((minute) => {
    const pass = idleRolePass(state, { ...inputAt(minute), routing: undefined, now: at(minute) });
    state = pass.state;
    return [...pass.reports];
  });
}

verifies("paperclip.merge-watchers-idle-role", () => {
  test("reports a reviewer with no task and no run 61 minutes after going live, exactly once", () => {
    const reports = passes([0, 59, 61, 70, 200], () => ({ agents: holders(), assigned: busy }));
    expect(reports.map((list) => list.map((report) => report.agent))).toEqual([
      [],
      [],
      ["Nora"],
      [],
      [],
    ]);
    expect(reports[2]).toEqual([
      { agent: "Nora", roles: ["routine-reviewer"], since: now.toISOString(), minutes: 61 },
    ]);
  });

  test("leaves alone a reviewer who got a task within the hour", () => {
    const reports = passes([0, 30, 61, 120], (minute) => ({
      agents: holders(),
      assigned: minute === 30 ? new Set([...busy, routineId]) : busy,
    }));
    expect(reports.flat()).toEqual([]);
  });

  test("leaves alone a reviewer whose run began within the hour, unless it ended in error", () => {
    const ran = { lastHeartbeatAt: at(30).toISOString() };
    const good = passes([0, 61], () => ({ agents: holders({ [routine]: ran }), assigned: busy }));
    expect(good.flat()).toEqual([]);
    const failed = passes([0, 61], () => ({
      agents: holders({ [routine]: { ...ran, status: "error" } }),
      assigned: busy,
    }));
    expect(failed.flat().map((report) => report.agent)).toEqual(["Nora"]);
  });

  test("doesn't count a run from before the agent went live", () => {
    const old = { lastHeartbeatAt: at(-30) };
    const reports = passes([0, 61], () => ({
      agents: holders({ [routine]: old }),
      assigned: busy,
    }));
    expect(reports.flat().map((report) => report.agent)).toEqual(["Nora"]);
  });

  test("counts again after a pause, and never counts an agent that isn't live", () => {
    const reports = passes([0, 61, 90, 100, 161], (minute) => ({
      agents: holders(minute === 90 ? { [routine]: { status: "paused" } } : {}),
      assigned: busy,
    }));
    expect(reports.map((list) => list.length)).toEqual([0, 1, 0, 0, 1]);
    const paused = passes([0, 61], () => ({
      agents: holders({ [routine]: { status: "paused" } }),
      assigned: busy,
    }));
    expect(paused.flat()).toEqual([]);
  });

  test("takes the role holders from the routing", () => {
    const routing = {
      roles: { "code-reviewer": "liam", "routine-reviewer": "kim" },
      areas: {},
    } as unknown as Parameters<typeof roleHolders>[0];
    expect(roleHolders(routing).get("kim")).toEqual(["routine-reviewer"]);
  });

  test("names each agent, its roles and its wait", () => {
    const text = idleRoleText([
      { agent: "Nora", roles: ["routine-reviewer"], since: now.toISOString(), minutes: 61 },
    ]);
    expect(text).toContain("Idle role: 1 agent with a role has had no work");
    expect(text).toContain(`- Nora (routine-reviewer): live since ${now.toISOString()}, 61 min`);
  });

  test("comments on Chief's chat, waking Chief, and on the board line, once", async () => {
    const { host, writes } = fakeHost([]);
    const agents = holders();
    const job = fakeJobContext({
      host: { ...host, agents: { list: async () => agents as never } },
      configs: { acme: {} },
      answers: {},
    });
    const settings: WatchersSettings = {
      dryRun: false,
      wakeTasks: { Liam: "", Julian: "" },
      unhandledTask: "task-chief-chat",
      boardLineTask: "task-board-line",
      handQueueBranches: [],
    };
    const tasks: TaskRow[] = [...busy].map((id, index) => ({
      id: `task-${index}`,
      identifier: `HAL-${index + 1}`,
      assigneeAgentId: id,
      running: false,
      openChildren: false,
      monitorNextCheckAt: null,
      monitorLastTriggeredAt: null,
    }));
    for (const minutes of [0, 61, 70]) {
      await runMergeWatchers(job.ctx, {
        companyId: "acme",
        snapshot: { version: 1, takenAt: now.toISOString(), closedWindowDays: 3, repos: [] },
        repo: "acme/tools",
        settings,
        tasks,
        found: new Map(),
        now: at(minutes),
      });
    }
    expect(job.sent).toEqual([]);
    expect(writes.map((write) => [write.kind, write.issueId])).toEqual([
      ["comment", "task-chief-chat"],
      ["wake", "task-chief-chat"],
      ["comment", "task-board-line"],
    ]);
  });
});
