import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type RunDetail, WorkflowRuns } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterAll, beforeAll, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { stoppedResult } from "../../follow-run.ts";
import { openLocalEngine } from "../../local-engine-host.ts";
import { plainText } from "../../messages/phrase.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { runResult } from "./result.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;
let workspace: LoadedWorkspace;
let run: RunDetail;
let events: readonly RunEvent[];

/**
 * Support reply on Sam's email, run to its wait in the Acme example, once for the whole file:
 * the tests only read it. Running it before each test took up to 3 s a test in CI (HAL-5473).
 */
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-stopped-"));
  acme = join(folder, "acme");
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
    run = started.run;
    events = started.run.events;
  } finally {
    await engine.close();
  }
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** The run's log up to the moment it entered `state`, as a Ctrl C there would leave it. */
function until(state: string): RunEvent[] {
  const entered = events.findIndex(
    (event) => event.type === "state.entered" && event.state === state,
  );
  return events.slice(0, entered + 1);
}

/** A follow stopped by Ctrl C with `events` so far, whose cancel worked or not. */
function stopped(events: readonly RunEvent[], cancelled = true) {
  return { runId: run.summary.id, events, cancelled };
}

verifies("cli.run", () => {
  it("says the run was cancelled after the last step that finished", () => {
    const result = stoppedResult(stopped(until("draft")), workspace);

    expect(plainText(result.meaning ?? [])).toMatch(
      /^The run \w{6} was cancelled after the step Classify it\. Nothing after it ran\.$/,
    );
  });

  it("says a run it couldn't cancel wasn't cancelled, and how to see it", () => {
    const result = stoppedResult(stopped(until("draft"), false), workspace);

    expect(plainText(result.meaning ?? [])).toMatch(
      /^The run (\w{6}) wasn't cancelled, only no longer followed, so it may go on\. See where it is: halonic runs show \1$/,
    );
    expect(result.json).toEqual({
      run: expect.objectContaining({ id: run.summary.id }),
      events: until("draft"),
    });
  });

  it("says a run it couldn't cancel wasn't cancelled, even before any step finished", () => {
    const result = stoppedResult(stopped([], false), workspace);

    expect(plainText(result.meaning ?? [])).toMatch(/^The run \w{6} wasn't cancelled,/);
    expect(result.json).toEqual({});
  });

  it("says only Stopped. when no step had finished yet", () => {
    expect(stoppedResult(stopped(until("read")), workspace).meaning).toBeUndefined();
  });

  it("says only Stopped. when the run hadn't started", () => {
    expect(stoppedResult(stopped([]), workspace)).toEqual({ stopped: true, json: {} });
  });

  it("exits as a failure for a run that couldn't try every step (HAL-4285)", () => {
    const facts = {
      workspace,
      workspaceName: "acme",
      dir: undefined,
      clock: { now: new Date(run.summary.startedAt), timeZone: "UTC" },
    };
    const cantTry = { ...run, summary: { ...run.summary, status: "cant-try" as const } };

    expect(runResult(cantTry, facts).exitCode).toBe(exitCode.failed);
    expect(runResult(run, facts).exitCode).toBe(exitCode.ok);
  });

  it("shows an escape code in the workflow's name as its code", async () => {
    const workflowFile = join(acme, "hubs/support/workflows/support-reply.workflow.yaml");
    const workflow = await readFile(workflowFile, "utf8");
    await writeFile(
      workflowFile,
      workflow.replace("name: Support reply", 'name: "\\e[2JSupport reply"'),
    );
    // The folder is the whole file's, so it gets its workflow back.
    const renamed = await loadWorkspace(new FolderDefinitionStore(acme, "./acme")).finally(() =>
      writeFile(workflowFile, workflow),
    );

    const result = runResult(run, {
      workspace: renamed,
      workspaceName: "acme",
      dir: undefined,
      clock: { now: new Date(run.summary.startedAt), timeZone: "UTC" },
    });

    expect(plainText(result.lines[0] ?? [])).toMatch(
      /^Running \\u001b\[2JSupport reply in acme · run \w{6}$/,
    );
  });
});
