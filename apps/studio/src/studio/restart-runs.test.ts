import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { ServiceRegistry } from "@halonicjs/app";
import type { PendingApproval, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { countRestartRuns, restartRunsOfWindow, type WindowRuns } from "./restart-runs.ts";

/** A run as the engine's store lists it, with only what the count reads. */
function run(id: string, status: "running" | "waiting", askedBy?: string): RunSummary {
  const approvals = askedBy === undefined ? [] : [{ agent: askedBy } as PendingApproval];
  return { id, status, approvals } as unknown as RunSummary;
}

async function engineWith(runs: readonly RunSummary[]): Promise<WindowRuns> {
  const workspace = await loadWorkspace(
    new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "agents/coder.agent.yaml": "id: coder\nname: Coder\nharness: claude-code\n",
      "agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: test\n",
    }),
  );
  return { openRuns: async () => ({ runs, workspace }) };
}

verifies("studio.restart-runs", () => {
  describe("restartRunsOfWindow", () => {
    it("reports no run while the window has no engine", async () => {
      const host = restartRunsOfWindow(new ServiceRegistry());
      expect(await host.count()).toEqual({ running: 0, waitingForYou: 0 });
    });
  });

  describe("countRestartRuns", () => {
    it("reports no run while the engine isn't open", async () => {
      expect(await countRestartRuns({ openRuns: async () => undefined })).toEqual({
        running: 0,
        waitingForYou: 0,
      });
    });

    it("counts the runs with a step in progress", async () => {
      const engine = await engineWith([run("a", "running"), run("b", "running")]);
      expect(await countRestartRuns(engine)).toEqual({ running: 2, waitingForYou: 0 });
    });

    it("counts a run whose Claude Code call waits for the person as running and waiting for you", async () => {
      const engine = await engineWith([run("a", "running"), run("b", "waiting", "coder")]);
      expect(await countRestartRuns(engine)).toEqual({ running: 2, waitingForYou: 1 });
    });

    it("leaves out a run that waits for an answer it gets back from its run log", async () => {
      const engine = await engineWith([run("a", "waiting"), run("b", "waiting", "writer")]);
      expect(await countRestartRuns(engine)).toEqual({ running: 0, waitingForYou: 0 });
    });
  });
});
