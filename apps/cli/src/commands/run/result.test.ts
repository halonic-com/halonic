import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { WorkflowRuns } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openLocalEngine } from "../../local-engine-host.ts";
import { plainText } from "../../messages/phrase.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { stoppedResult } from "./result.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let workspace: LoadedWorkspace;
let events: readonly RunEvent[];

/** Support reply on Sam's email, run to its wait in the Acme example. */
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-stopped-"));
  const acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  workspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
  const engine = await openLocalEngine({
    workspace,
    workspaceRoot: acme,
    secrets: { get: async () => null },
    http: { fetch: () => Promise.reject(new TypeError("no server")) },
    environment: { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } },
    reportError: (error) => {
      throw error;
    },
  });
  try {
    const input = JSON.parse(await readFile(join(acme, "examples/refund-question.json"), "utf8"));
    const started = await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "support-reply",
      input,
    );
    if (started.found !== "one") throw new Error("Support reply didn't start.");
    events = started.run.events;
  } finally {
    await engine.close();
  }
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** The run's log up to the moment it entered `state`, as a Ctrl C there would leave it. */
function until(state: string): RunEvent[] {
  const entered = events.findIndex(
    (event) => event.type === "state.entered" && event.state === state,
  );
  return events.slice(0, entered + 1);
}

verifies("cli.run", () => {
  it("says the run was cancelled after the last step that finished", () => {
    const stopped = stoppedResult(until("draft"), workspace);

    expect(plainText(stopped.meaning ?? [])).toMatch(
      /^The run \w{6} was cancelled after the step Classify it\. Nothing after it ran\.$/,
    );
  });

  it("says only Stopped. when no step had finished yet", () => {
    expect(stoppedResult(until("read"), workspace).meaning).toBeUndefined();
  });

  it("says only Stopped. when the run hadn't started", () => {
    expect(stoppedResult([], workspace)).toEqual({ stopped: true, json: {} });
  });
});
