import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { LiveRoutines } from "./live-routines.ts";
import { liveVersionOf } from "./live-version.ts";
import { runSourceFor, runVersionOf } from "./run-source.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { StreamingExecutor } from "./testing/streaming-executor.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import { TestVersions } from "./testing/test-versions.ts";
import { WorkflowRuns } from "./workflow-runs.ts";
import { workspaceRoutineScheduler } from "./workspace-routines.ts";

const digestPath = "hubs/news/workflows/digest.workflow.yaml";
const morningPath = "hubs/news/workflows/routines/morning.routine.yaml";

/** Acme's news hub, with a "digest" workflow that its "morning" routine runs every day at 8. */
const acmeFiles = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/news/hub.yaml": "id: news\nname: News\n",
  [digestPath]: "id: digest\nname: Digest\ninitial: done\nstates:\n  done:\n    type: final\n",
  [morningPath]: [
    "id: morning",
    "name: Morning",
    'trigger: { schedule: "0 8 * * *" }',
    "run: { workflow: digest }",
    "",
  ].join("\n"),
};

const versionDate = "2026-11-11T10:42:00Z";

/** Acme with every file in one version made on 11 November at 10:42, and saved as it is. */
function acme() {
  const versions = new TestVersions();
  const commit = versions.commit(acmeFiles, versionDate);
  const saved = new TestDefinitionStore(acmeFiles);
  return { versions, commit, saved };
}

/** The scheduler of acme's routines as the live version has them, ticked once at 08:00. */
async function startedAtEight(routines: LiveRoutines) {
  let now = Date.parse("2026-11-12T07:59:00Z");
  const executor = new TestExecutor();
  const scheduler = workspaceRoutineScheduler({
    workspaceId: "ws-5d81e0",
    clock: { now: () => new Date(now) },
    coordination: new TestCoordination(),
    executor,
    runs: executor,
    routines: () => routines.list(),
    runVersion: () => routines.runVersion(),
  });
  await scheduler.tick();
  now = Date.parse("2026-11-12T08:00:10Z");
  await scheduler.tick();
  return executor.requests;
}

verifies("app.run-records-its-version", () => {
  describe("runVersionOf", () => {
    it("gives the live version's commit and the date it was made", async () => {
      const { versions, commit, saved } = acme();
      const live = await liveVersionOf(versions);

      const picked = runSourceFor("run", { live, vcs: versions, saved });

      if (picked.reads === "nothing-live") throw new Error("Nothing is live.");
      expect(runVersionOf(picked)).toEqual({
        reads: "live-version",
        commit: commit.hash,
        versionDate,
      });
    });

    it("gives the saved files for Try it", async () => {
      const { versions, saved } = acme();
      const live = await liveVersionOf(versions);

      const picked = runSourceFor("try-it", { live, vcs: versions, saved });

      if (picked.reads === "nothing-live") throw new Error("Nothing is live.");
      expect(runVersionOf(picked)).toEqual({ reads: "saved-files" });
    });
  });

  it("passes the version to the executor with the start", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [{ type: "run.completed", state: "done", context: {} }];
    const workspace = await loadWorkspace(new TestDefinitionStore(acmeFiles));

    await new WorkflowRuns(executor).startRun(
      workspace,
      "digest",
      {},
      { version: { reads: "saved-files" } },
    );

    expect(executor.starts).toEqual([
      { hubId: "news", workflowId: "digest", input: {}, version: { reads: "saved-files" } },
    ]);
  });

  describe("the routine scheduler", () => {
    it("starts a routine run with the live version's commit and date", async () => {
      const { versions, commit, saved } = acme();

      const starts = await startedAtEight(new LiveRoutines({ vcs: versions, saved }));

      expect(starts).toEqual([
        expect.objectContaining({
          workflowId: "digest",
          version: { reads: "live-version", commit: commit.hash, versionDate },
        }),
      ]);
    });

    it("starts a routine run with the saved files while history is off", async () => {
      const saved = new TestDefinitionStore(acmeFiles);

      const starts = await startedAtEight(new LiveRoutines({ vcs: null, saved }));

      expect(starts).toEqual([
        expect.objectContaining({ workflowId: "digest", version: { reads: "saved-files" } }),
      ]);
    });

    it("has no version to record while nothing is live", async () => {
      const routines = new LiveRoutines({
        vcs: new TestVersions(),
        saved: new TestDefinitionStore(acmeFiles),
      });

      expect(await routines.runVersion()).toBeNull();
      expect(await routines.list()).toEqual([]);
    });
  });
});
