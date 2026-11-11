import type { DueRun, PlacedRoutine } from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { LiveRoutines } from "./live-routines.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import { TestVersions } from "./testing/test-versions.ts";
import { workspaceRoutineScheduler } from "./workspace-routines.ts";

// Acme's news hub: routine `morning` starts workflow `digest` at 08:00, and
// routine `inbox` starts agent `clerk` in the support hub.

const morningPath = "hubs/news/workflows/routines/morning.routine.yaml";
const inboxPath = "hubs/news/workflows/routines/inbox.routine.yaml";
const digestPath = "hubs/news/workflows/digest.workflow.yaml";
const clerkPath = "hubs/support/agents/clerk.agent.yaml";

const morning =
  'id: morning\nname: Morning\ntrigger: { schedule: "0 8 * * *" }\nrun: { workflow: digest }\n';
const inbox =
  'id: inbox\nname: Inbox\ntrigger: { schedule: "0 8 * * *" }\nrun: { agent: clerk, hub: support, prompt: Check the mail. }\n';
const digest = "id: digest\nname: Digest\ninitial: done\nstates:\n  done:\n    type: final\n";
const clerk = "id: clerk\nname: Clerk\ninstructions: Help.\nmodel: fast\n";

/** Acme's versions, its saved files, and the scheduler's routines over both. */
function acme(saved: Record<string, string>) {
  const versions = new TestVersions();
  const store = new TestDefinitionStore(saved);
  return { versions, store, routines: new LiveRoutines({ vcs: versions, saved: store }) };
}

/** The routine's 08:00 run, as the scheduler hands it to the check. */
function dueAt8(placed: PlacedRoutine): DueRun {
  return {
    key: `news/${placed.routine.id}`,
    placed,
    at: new Date("2026-11-03T08:00:00Z"),
    trigger: "schedule",
  };
}

/** Why each listed routine's 08:00 run can't start, by routine id. */
async function whys(routines: LiveRoutines): Promise<Record<string, string | null>> {
  const answers: Record<string, string | null> = {};
  for (const placed of await routines.list()) {
    answers[placed.routine.id] = await routines.targetUnavailable(dueAt8(placed));
  }
  return answers;
}

/** Routine `morning` as placed in the news hub, read from a version that holds it. */
async function placedMorning(): Promise<PlacedRoutine> {
  const { versions, routines } = acme({ [morningPath]: morning });
  versions.commit({ [morningPath]: morning });
  const [placed] = await routines.list();
  if (placed === undefined) {
    throw new Error("Routine morning isn't listed.");
  }
  return placed;
}

verifies("app.scheduler-skip-target-unavailable", () => {
  describe("LiveRoutines.targetUnavailable", () => {
    it("says never-live for a target that isn't in the live version, even when it is saved", async () => {
      const both = { [morningPath]: morning, [inboxPath]: inbox };
      const { versions, routines } = acme({ ...both, [digestPath]: digest, [clerkPath]: clerk });
      versions.commit(both);

      expect(await whys(routines)).toEqual({ morning: "never-live", inbox: "never-live" });
    });

    it("lets a live target start, in its own hub or the one the routine names", async () => {
      const files = {
        [morningPath]: morning,
        [inboxPath]: inbox,
        [digestPath]: digest,
        [clerkPath]: clerk,
      };
      const { versions, routines } = acme(files);
      versions.commit(files);

      expect(await whys(routines)).toEqual({ morning: null, inbox: null });
    });

    it("says in-trash for a live target whose saved file is gone", async () => {
      const files = { [morningPath]: morning, [digestPath]: digest };
      const { versions, routines } = acme({ [morningPath]: morning });
      versions.commit(files);

      expect(await whys(routines)).toEqual({ morning: "in-trash" });
    });

    it("says never-live while the workspace has no version yet", async () => {
      const { routines } = acme({ [morningPath]: morning, [digestPath]: digest });

      expect(await routines.targetUnavailable(dueAt8(await placedMorning()))).toBe("never-live");
    });

    it("lets a routine whose target has no hub through, as its start fails on its own", async () => {
      const files = { [morningPath]: morning, [digestPath]: digest };
      const { versions, routines } = acme(files);
      versions.commit(files);
      const hubless = { ...(await placedMorning()), hub: null };

      expect(await routines.targetUnavailable(dueAt8(hubless))).toBeNull();
    });

    it("lets every target start with history off, as the saved files are what runs", async () => {
      const { versions, routines } = acme({ [morningPath]: morning });
      versions.isRepo = false;

      expect(await whys(routines)).toEqual({ morning: null });
    });

    it("reads a new live version's targets once it moves", async () => {
      const files = { [morningPath]: morning, [digestPath]: digest };
      const { versions, routines } = acme(files);
      versions.commit({ [morningPath]: morning });
      expect(await whys(routines)).toEqual({ morning: "never-live" });

      versions.commit(files);

      expect(await whys(routines)).toEqual({ morning: null });
    });
  });

  it("skips a routine's time as target-unavailable when its workflow was never live", async () => {
    const { versions, routines } = acme({ [morningPath]: morning, [digestPath]: digest });
    versions.commit({ [morningPath]: morning });
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

    await scheduler.tick();

    expect(executor.requests).toEqual([]);
    expect(await scheduler.skippedTimes("news/morning")).toEqual([
      {
        reason: "target-unavailable",
        why: "never-live",
        from: "2026-11-03T08:00:00.000Z",
        to: "2026-11-03T08:00:00.000Z",
        count: 1,
        decidedAt: "2026-11-03T08:00:20.000Z",
      },
    ]);
  });
});
