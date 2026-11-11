import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { LiveRoutines } from "./live-routines.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import { TestVersions } from "./testing/test-versions.ts";
import { workspaceRoutineScheduler } from "./workspace-routines.ts";

const hub = "hubs/news/hub.yaml";
const hubFile = "id: news\nname: News\n";
const routinePath = "hubs/news/workflows/routines/morning.routine.yaml";
const digestPath = "hubs/news/workflows/digest.workflow.yaml";
const digest = "id: digest\nname: Digest\ninitial: done\nstates:\n  done:\n    type: final\n";

/** Routine "morning" in hub News, which starts `run` at 08:00. */
function morning(run = "{ workflow: digest }"): string {
  return ["id: morning", "name: Morning", 'trigger: { schedule: "0 8 * * *" }', `run: ${run}`].join(
    "\n",
  );
}

/** Agent `id`'s file in hub `hubId`. */
function agent(hubId: string, id: string): Record<string, string> {
  return {
    [`hubs/${hubId}/hub.yaml`]: `id: ${hubId}\nname: ${hubId}\n`,
    [`hubs/${hubId}/agents/${id}.agent.yaml`]: `id: ${id}\nname: ${id}\nmodel: fast\ninstructions: Work.\n`,
  };
}

/** Acme's versions and saved files, with routine "morning" live and saved as given. */
function acme(live: Record<string, string>, saved: Record<string, string>, run?: string) {
  const versions = new TestVersions();
  versions.commit({ [hub]: hubFile, [routinePath]: morning(run), ...live });
  const store = new TestDefinitionStore({ [hub]: hubFile, [routinePath]: morning(run), ...saved });
  return { versions, store, routines: new LiveRoutines({ vcs: versions, saved: store }) };
}

/** Why the target of "morning", as the live version has it, can't start. */
async function whyOf(routines: LiveRoutines) {
  const [placed] = await routines.list();
  if (placed === undefined) {
    throw new Error("Routine morning isn't scheduled.");
  }
  return routines.targetUnavailable({ placed });
}

verifies("app.scheduler-target-unavailable-live", () => {
  it("is never-live for a target that is saved but in no version", async () => {
    const { routines } = acme({}, { [digestPath]: digest });
    expect(await whyOf(routines)).toBe("never-live");
  });

  it("is in-trash for a live target whose saved file is gone", async () => {
    const { routines } = acme({ [digestPath]: digest }, {});
    expect(await whyOf(routines)).toBe("in-trash");
  });

  it("lets a target start that is live and saved", async () => {
    const { routines } = acme({ [digestPath]: digest }, { [digestPath]: digest });
    expect(await whyOf(routines)).toBeNull();
  });

  it("looks for the target in the hub the routine names", async () => {
    const run = "{ agent: clerk, hub: support, prompt: Check the mail. }";
    const { routines } = acme(agent("sales", "clerk"), agent("support", "clerk"), run);
    expect(await whyOf(routines)).toBe("never-live");
  });

  it("lets a target start that is neither live nor saved, so it fails on its own", async () => {
    const { routines } = acme(
      { [digestPath]: digest },
      { [digestPath]: digest },
      "{ workflow: digets }",
    );
    expect(await whyOf(routines)).toBeNull();
  });

  it("lets every target start with history off", async () => {
    const versions = new TestVersions();
    versions.isRepo = false;
    const store = new TestDefinitionStore({ [hub]: hubFile, [routinePath]: morning() });
    const routines = new LiveRoutines({ vcs: versions, saved: store });
    expect(await whyOf(routines)).toBeNull();
  });

  it("makes the scheduler skip a time whose target was never live, and start nothing", async () => {
    const { routines } = acme({}, { [digestPath]: digest });
    let now = Date.parse("2026-11-03T07:30:00Z");
    const executor = new TestExecutor();
    const scheduler = workspaceRoutineScheduler({
      workspaceId: "ws-5d81e0",
      clock: { now: () => new Date(now) },
      coordination: new TestCoordination(),
      executor,
      runs: executor,
      routines: () => routines.list(),
      targetUnavailable: (run) => routines.targetUnavailable(run),
    });
    await scheduler.tick();
    now = Date.parse("2026-11-03T08:00:20Z");

    const tick = await scheduler.tick();

    expect(executor.requests).toEqual([]);
    expect(tick.unavailable).toEqual([
      { key: "news/morning", at: "2026-11-03T08:00:00.000Z", why: "never-live" },
    ]);
  });
});
