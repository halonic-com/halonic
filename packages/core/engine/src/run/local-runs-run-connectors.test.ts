import type { RunVersion } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import type { ChatResponse, ConnectorClient, ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelBlobs, KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import { readRun } from "../kernel/step.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";
import { type ConnectorsRun, type RunConnectors, RunsConnectors } from "./run-connectors.ts";

/**
 * Connectors of runs in memory: each run that opens gets its own `mail`,
 * whose one tool is `send_mail`, labelled `send`. Opening a run that is
 * open gives the same clients again, as the port asks.
 */
class NotingConnectors implements RunConnectors {
  /** The runs whose connectors were started, in order. */
  readonly started: ConnectorsRun[] = [];
  readonly ended: string[] = [];
  /** The `mail` each run got, by run id. */
  readonly mail = new Map<string, ScriptedConnector>();
  /** What the next `open` of these runs throws, once. */
  readonly failing = new Map<string, Error>();
  /** A local `files` connector each run gets too, when set. */
  readonly files: ScriptedConnector | undefined;

  constructor(files?: ScriptedConnector) {
    this.files = files;
  }

  async open(run: ConnectorsRun): Promise<readonly ConnectorClient[]> {
    const error = this.failing.get(run.runId);
    if (error !== undefined) {
      this.failing.delete(run.runId);
      throw error;
    }
    let mail = this.mail.get(run.runId);
    if (mail === undefined) {
      mail = new ScriptedConnector("mail", [sendMailTool], () => `Sent from ${run.runId}`);
      this.mail.set(run.runId, mail);
      this.started.push(run);
    }
    return this.files === undefined ? [mail] : [mail, this.files];
  }

  async end(runId: string): Promise<void> {
    this.ended.push(runId);
    this.mail.delete(runId);
  }
}

const sendMailTool: ConnectorTool = {
  name: "send_mail",
  description: "Sends a mail",
  parameters: { type: "object", properties: { to: { type: "string" } } },
  risk: "send",
};

const readFileTool: ConnectorTool = {
  name: "read_file",
  description: "Reads a file",
  parameters: { type: "object", properties: { path: { type: "string" } } },
  risk: "read",
};

/** Connector calls with sending on. */
const connectorCalls: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending: { checkSending: async () => ({ allowed: true }) },
  reportSettingsError: () => {},
};

const liveVersion: RunVersion = {
  reads: "live-version",
  commit: "4f2a9c1e0b7d",
  versionDate: "2026-11-10T09:42:00+01:00",
};

/** The connector every run calls when the host gives no connectors of runs. */
function sharedMail(): ScriptedConnector {
  return new ScriptedConnector("mail", [sendMailTool], () => "Sent from the shared mail");
}

/** A parent whose one state runs the reply workflow as child run `run_1.2`. */
const onboard: Workflow = {
  version: 1,
  id: "onboard",
  name: "Onboard a customer",
  initial: "reply",
  context: {},
  states: {
    reply: { type: "workflow", workflow: "reply", input: {}, on: [{ to: "done", event: "done" }] },
    done: { type: "final", on: [] },
  },
  layout: {},
};

const sendMail = callAnswer(call("m-1", "send_mail", { to: "support" }));

/** A reply run whose writer, listing `mail`, waits for the OK on `send_mail`. */
async function waitingForOk(
  connectors: NotingConnectors,
  blobs = new KernelBlobs(),
  after: ChatResponse[] = [],
) {
  const runs = new KernelRuns();
  const setup = runsOn([sendMail, ...after], runs, {
    agents: agentsUsing(["mail"], "writer"),
    connectors: [sharedMail()],
    connectorCalls,
    runConnectors: connectors,
    blobs,
  });
  await setup.executor.start({ ...replyStart, version: liveVersion });
  await setup.scheduler.runDue();
  return { ...setup, blobs };
}

verifies("engine.run-connectors", () => {
  it("opens the run's connectors at its version for the model call, and ends them once with the run", async () => {
    const connectors = new NotingConnectors();
    const { executor, scheduler, runs, model } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents: agentsUsing(["mail"], "writer"),
      connectors: [new ScriptedConnector("mail", [{ ...sendMailTool, name: "shared_tool" }])],
      connectorCalls,
      runConnectors: connectors,
    });

    await executor.start({ ...replyStart, version: liveVersion });
    expect(connectors.started).toEqual([]);
    await scheduler.runDue();

    expect(connectors.started).toEqual([
      {
        runId: "run_1",
        hubId: "acme",
        workflowId: "reply",
        version: liveVersion,
        localOnly: false,
      },
    ]);
    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["send_mail"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(connectors.ended).toEqual(["run_1"]);
  });

  it("opens none for a run whose agent lists no connector", async () => {
    const connectors = new NotingConnectors();
    const { executor, scheduler, runs } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents: agentsUsing([], "writer"),
      connectorCalls,
      runConnectors: connectors,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(connectors.started).toEqual([]);
  });

  it("gives a child run its top-level run's connectors, and ends them once, with the top-level run", async () => {
    const connectors = new NotingConnectors();
    const { executor, scheduler, runs, model } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      workflow: onboard,
      workflows: { reply: replyWorkflow },
      agents: agentsUsing(["mail"], "writer"),
      connectorTools: { mail: { approve: [] } },
      connectorCalls,
      runConnectors: connectors,
    });

    await executor.start({ hubId: "acme", workflowId: "onboard", input: {} });
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["send_mail"]);
    expect(connectors.started.map(({ runId }) => runId)).toEqual(["run_1"]);
    expect(connectors.ended).toEqual(["run_1"]);
  });

  it("fails only the run whose connectors can't start, with an error that names its agent", async () => {
    const connectors = new NotingConnectors();
    connectors.failing.set("run_1", new Error("mail exited with code 1"));
    const { executor, scheduler, runs } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents: agentsUsing(["mail"], "writer"),
      connectorTools: { mail: { approve: [] } },
      connectorCalls,
      runConnectors: connectors,
    });

    await executor.start(replyStart);
    await executor.start(replyStart);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      error: 'The connectors of agent "writer" couldn\'t start: mail exited with code 1',
    });
    expect(await runs.get("run_2")).toMatchObject({ status: "completed" });
    expect(connectors.ended).toEqual(["run_1", "run_2"]);
  });

  it("opens them again on a new host for a run that waited across the restart, and calls the new ones", async () => {
    const before = new NotingConnectors();
    const { runs, blobs } = await waitingForOk(before);
    expect(before.started.map(({ runId }) => runId)).toEqual(["run_1"]);

    const after = new NotingConnectors();
    const restarted = runsOn([textAnswer("Posted")], runs, {
      agents: agentsUsing(["mail"], "writer"),
      connectors: [sharedMail()],
      connectorCalls,
      runConnectors: after,
      blobs,
    });
    await restarted.executor.send("run_1", "approve");
    await restarted.scheduler.runDue();

    expect(after.started).toEqual([
      {
        runId: "run_1",
        hubId: "acme",
        workflowId: "reply",
        version: liveVersion,
        localOnly: false,
      },
    ]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    const results = (runs.logs.get("run_1") ?? []).filter((event) => event.type === "tool.result");
    expect(results).toMatchObject([{ outcome: "ok" }]);
    expect(after.ended).toEqual(["run_1"]);
  });

  it("fails the resumed model call when the connectors can't start on the new host", async () => {
    const { runs, blobs } = await waitingForOk(new NotingConnectors());

    const after = new NotingConnectors();
    after.failing.set("run_1", new Error("mail exited with code 1"));
    const restarted = runsOn([], runs, {
      agents: agentsUsing(["mail"], "writer"),
      connectorCalls,
      runConnectors: after,
      blobs,
    });
    await restarted.executor.send("run_1", "approve");
    await restarted.scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      error: 'The connectors of agent "writer" couldn\'t start: mail exited with code 1',
    });
    expect(after.ended).toEqual(["run_1"]);
  });

  it("doesn't make a recorded call when the connectors can't start for it, and tells the model why", async () => {
    const connectors = new NotingConnectors();
    const { executor, scheduler, runs, model } = await waitingForOk(connectors, new KernelBlobs(), [
      textAnswer("Couldn't send"),
    ]);
    await executor.send("run_1", "approve");
    // The resumed model call opens them, and records the call; then they stop working.
    const modelCall = [...scheduler.timers.values()].find(({ timerId }) =>
      timerId.startsWith("call:"),
    );
    if (modelCall === undefined) throw new Error("No model call is due.");
    await scheduler.deliver(modelCall.key, modelCall.timerId);
    connectors.failing.set("run_1", new Error("mail exited with code 1"));
    await scheduler.runDue();

    const results = (runs.logs.get("run_1") ?? []).filter((event) => event.type === "tool.result");
    expect(results).toMatchObject([{ outcome: "error" }]);
    const told = model.requests.at(-1)?.messages.find((message) => message.role === "tool");
    expect(told?.content).toContain(
      "The call wasn't made: the connector \"mail\" isn't connected: mail exited with code 1.",
    );
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("ends the connectors of a run that is cancelled while it waits", async () => {
    const connectors = new NotingConnectors();
    const { executor } = await waitingForOk(connectors);

    await executor.cancel("run_1");

    expect(connectors.ended).toEqual(["run_1"]);
  });

  it("ends again, and doesn't give, connectors that open after their run has ended", async () => {
    const connectors = new NotingConnectors();
    const { executor, runs } = await waitingForOk(connectors);
    await executor.cancel("run_1");
    const run = await readRun(runs, "run_1");
    if (run === null) throw new Error("run_1 has no log");

    await expect(new RunsConnectors(runs, connectors, []).of(run)).rejects.toThrow(
      'Run "run_1" has ended, so its connectors are closed.',
    );
    expect(connectors.ended).toEqual(["run_1", "run_1"]);
  });

  it("in a local-only workspace, asks the host for local connectors only and offers no other it gives", async () => {
    const files = Object.assign(new ScriptedConnector("files", [readFileTool]), { local: true });
    const connectors = new NotingConnectors(files);
    const { executor, scheduler, runs, model } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents: agentsUsing(["mail", "files"], "writer"),
      connectorTools: { mail: { approve: [] }, files: { approve: [] } },
      connectorCalls,
      runConnectors: connectors,
      localOnly: true,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(connectors.started.map(({ localOnly }) => localOnly)).toEqual([true]);
    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["read_file"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("in a local-only workspace, refuses an approved call to a connector that isn't local, and makes none", async () => {
    const before = new NotingConnectors();
    const { runs, blobs } = await waitingForOk(before);

    const after = new NotingConnectors();
    const restarted = runsOn([textAnswer("Couldn't send")], runs, {
      agents: agentsUsing(["mail"], "writer"),
      connectorCalls,
      runConnectors: after,
      blobs,
      localOnly: true,
    });
    await restarted.executor.send("run_1", "approve");
    await restarted.scheduler.runDue();

    expect(after.mail.get("run_1")?.calls ?? []).toEqual([]);
    const log = runs.logs.get("run_1") ?? [];
    expect(log.filter((event) => event.type === "tool.result")).toEqual([]);
    expect(log.filter((event) => event.type === "tool.refused")).toMatchObject([
      { reason: "not-offered" },
    ]);
  });

  it("calls the executor's connectors when the host gives no connectors of runs", async () => {
    const shared = sharedMail();
    const { executor, scheduler, runs } = runsOn(
      [sendMail, textAnswer("Posted")],
      new KernelRuns(),
      {
        agents: agentsUsing(["mail"], "writer"),
        connectors: [shared],
        connectorCalls,
      },
    );

    await executor.start(replyStart);
    await scheduler.runDue();
    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(shared.calls).toEqual([{ name: "send_mail", args: { to: "support" } }]);
  });
});
