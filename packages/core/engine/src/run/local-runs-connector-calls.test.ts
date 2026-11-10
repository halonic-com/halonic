import type { SendingCheck, SendingSettings } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { Connector } from "@halonicjs/format";
import type { ChatResponse, ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { KernelBlobs, KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** The `mail` connector's `send_mail`, listed with `risk`. */
function mailTool(name: string, risk: ToolRisk): ConnectorTool {
  return {
    name,
    description: `Does ${name}`,
    parameters: { type: "object", properties: { to: { type: "string" } } },
    risk,
  };
}

/** Sending settings that give `settings.check`, which a test may change, and the errors the host heard. */
function settingsGiving(check: SendingCheck) {
  const reported: unknown[] = [];
  const settings = { check };
  const sending: SendingSettings = { checkSending: async () => settings.check };
  const connectorCalls: RunConnectorCalls = {
    location: "/workspaces/acme",
    sending,
    reportSettingsError: (_connector, error) => reported.push(error),
  };
  return { connectorCalls, reported, settings };
}

const sendingOff: SendingCheck = {
  allowed: false,
  reason: 'sending is off for the connector "mail"',
};

/** The reply workflow's writer, whose file lists `mail`. */
const mailWriter = agentsUsing(["mail"], "writer");

const sendMail = callAnswer(call("m-1", "send_mail", { to: "support" }));

/**
 * A run of the reply workflow whose agent calls `send_mail` on `mail`, then
 * answers `Posted`. With sending on, it waits for the OK on the call.
 */
async function waitingForOk(
  answer: (name: string, args: Record<string, unknown>) => string = () => "Sent",
  check: SendingCheck = { allowed: true },
  after: ChatResponse[] = [textAnswer("Posted")],
) {
  const mail = new ScriptedConnector("mail", [mailTool("send_mail", "send")], answer);
  const { connectorCalls, reported, settings } = settingsGiving(check);
  const runs = new KernelRuns();
  const blobs = new KernelBlobs();
  const setup = runsOn([sendMail, ...after], runs, {
    agents: mailWriter,
    connectors: [mail],
    connectorCalls,
    blobs,
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return { ...setup, mail, reported, settings };
}

function eventsOf(events: readonly RunEvent[] | undefined, type: string): RunEvent[] {
  return (events ?? []).filter((event) => event.type === type);
}

/** The tool message the model got for `m-1` in its last request. */
function lastResult(model: { requests: { messages: { role: string; content: string }[] }[] }) {
  return model.requests.at(-1)?.messages.find((message) => message.role === "tool")?.content;
}

verifies("engine.run-connector-calls", () => {
  typeTest("gives the engine only the read side of the connection settings", () => {
    expectTypeOf<RunConnectorCalls["sending"]>().toEqualTypeOf<SendingSettings>();
  });

  it("records a send the person approved before it makes it, once, and goes on with its result", async () => {
    const { executor, scheduler, runs, mail, model } = await waitingForOk();

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(mail.calls).toEqual([{ name: "send_mail", args: { to: "support" } }]);
    const log = runs.logs.get("run_1");
    expect(
      typesOf(log).filter(
        (type) =>
          type.startsWith("effect") || type.startsWith("tool") || type.startsWith("connector"),
      ),
    ).toEqual(["effect.requested", "connector.started", "tool.called", "tool.result"]);
    expect(eventsOf(log, "effect.requested")).toMatchObject([
      { callId: "call-4", idempotencyKey: "run_1:call-4", connector: "mail" },
    ]);
    expect(eventsOf(log, "tool.result")).toMatchObject([{ outcome: "ok", risk: "send" }]);
    expect(lastResult(model)).toContain("Sent");
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("refuses a send as data when sending is off, without asking a person or recording a call", async () => {
    const { runs, mail, model } = await waitingForOk(undefined, sendingOff);

    expect(mail.calls).toEqual([]);
    const types = typesOf(runs.logs.get("run_1"));
    expect(types).not.toContain("approval.requested");
    expect(types).not.toContain("effect.requested");
    expect(lastResult(model)).toBe('Refused: sending is off for the connector "mail"');
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("checks sending again after the OK, in case it was switched off while the run waited", async () => {
    const { executor, scheduler, runs, mail, model, settings } = await waitingForOk();
    settings.check = sendingOff;

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(mail.calls).toEqual([]);
    expect(eventsOf(runs.logs.get("run_1"), "effect.requested")).toEqual([]);
    expect(lastResult(model)).toBe('Refused: sending is off for the connector "mail"');
  });

  it("gives the host the store's error when the settings can't be read, and the model only the reason", async () => {
    const error = new Error("EACCES: settings in the profile folder");
    const reason = 'the settings of the connector "mail" can\'t be read, so sending is off';
    const { reported, model } = await waitingForOk(undefined, { allowed: false, reason, error });

    expect(reported).toEqual([error]);
    expect(lastResult(model)).toBe(`Refused: ${reason}`);
    expect(JSON.stringify(model.requests)).not.toContain("EACCES");
  });

  it("makes a call to a tool that only reads in the turn, with no record before it", async () => {
    const mail = new ScriptedConnector("mail", [mailTool("search", "read")], () => "3 mails");
    const { connectorCalls } = settingsGiving({ allowed: true });
    const answers = [callAnswer(call("s-1", "search", { to: "support" })), textAnswer("Found")];
    const { executor, scheduler, runs } = runsOn(answers, new KernelRuns(), {
      agents: mailWriter,
      connectors: [mail],
      connectorCalls,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(mail.calls).toHaveLength(1);
    expect(eventsOf(runs.logs.get("run_1"), "effect.requested")).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Found" },
    });
  });

  it("offers no connector's tools when the executor has no connector calls", async () => {
    const mail = new ScriptedConnector("mail", [mailTool("search", "read")]);
    const { executor, scheduler, model } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents: mailWriter,
      connectors: [mail],
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests[0]?.tools).toEqual([]);
  });

  it("offers a run's agent only the tools of the connectors its file lists", async () => {
    const mail = new ScriptedConnector("mail", [mailTool("search", "read")]);
    const tracker = new ScriptedConnector("tracker", [mailTool("search_issues", "read")]);
    const { connectorCalls } = settingsGiving({ allowed: true });
    const { executor, scheduler, model } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents: mailWriter,
      connectors: [mail, tracker],
      connectorCalls,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["search"]);
  });

  it.each([
    ["whose file lists none", agentsUsing([], "writer")],
    ["the run's definitions have no file for", agentsUsing(["mail"], "checker")],
  ])("offers no connector's tools to an agent %s", async (_, agents) => {
    const mail = new ScriptedConnector("mail", [mailTool("search", "read")]);
    const { connectorCalls } = settingsGiving({ allowed: true });
    const { executor, scheduler, model } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents,
      connectors: [mail],
      connectorCalls,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests[0]?.tools).toEqual([]);
  });

  it("doesn't call a connector its agent's file doesn't list, when the model names one of its tools", async () => {
    const mail = new ScriptedConnector("mail", [mailTool("search", "read")]);
    const tracker = new ScriptedConnector("tracker", [mailTool("create_issue", "write")]);
    const { connectorCalls } = settingsGiving({ allowed: true });
    const answers = [callAnswer(call("c-1", "create_issue", {})), textAnswer("Done")];
    const { executor, scheduler, runs } = runsOn(answers, new KernelRuns(), {
      agents: mailWriter,
      connectors: [mail, tracker],
      connectorCalls,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(tracker.calls).toEqual([]);
    const types = typesOf(runs.logs.get("run_1"));
    expect(types).not.toContain("approval.requested");
    expect(types).not.toContain("effect.requested");
  });
});

verifies("engine.run-connector-allow", () => {
  it("offers only the tools its connector's file allows, and calls none the model names past them", async () => {
    const mail = new ScriptedConnector("mail", [
      mailTool("search", "read"),
      mailTool("delete_all", "read"),
    ]);
    const { connectorCalls } = settingsGiving({ allowed: true });
    const answers = [callAnswer(call("d-1", "delete_all", {})), textAnswer("Done")];
    const { executor, scheduler, model } = runsOn(answers, new KernelRuns(), {
      agents: mailWriter,
      connectors: [mail],
      connectorTools: { mail: { allow: ["search"], approve: [] } },
      connectorCalls,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["search"]);
    expect(mail.calls).toEqual([]);
  });

  it("offers no tools of a connector the run's definitions have no file for", async () => {
    const mail = new ScriptedConnector("mail", [mailTool("search", "read")]);
    const { connectorCalls } = settingsGiving({ allowed: true });
    const { executor, scheduler, model } = runsOn([textAnswer("Hi")], new KernelRuns(), {
      agents: mailWriter,
      connectors: [mail],
      connectorTools: {},
      connectorCalls,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests[0]?.tools).toEqual([]);
  });
});

/** A run whose agent calls `tool` on `mail`, whose kept file has the `approve` list given. */
async function callingUnder(approve: Connector["tools"]["approve"], tool: ConnectorTool) {
  const mail = new ScriptedConnector("mail", [tool], () => "3 mails");
  const { connectorCalls } = settingsGiving({ allowed: true });
  const answers = [callAnswer(call("s-1", tool.name, { to: "support" })), textAnswer("Found")];
  const setup = runsOn(answers, new KernelRuns(), {
    agents: mailWriter,
    connectors: [mail],
    connectorTools: { mail: { approve } },
    connectorCalls,
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return { ...setup, mail };
}

verifies("engine.run-connector-approve", () => {
  it("waits for a person before a read tool its connector's file puts under approve", async () => {
    const { executor, scheduler, runs, mail } = await callingUnder(
      ["search"],
      mailTool("search", "read"),
    );

    expect(mail.calls).toEqual([]);
    expect(typesOf(runs.logs.get("run_1"))).toContain("approval.requested");
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(mail.calls).toEqual([{ name: "search", args: { to: "support" } }]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("waits for a person before every tool when the file says approve: all", async () => {
    const { runs, mail } = await callingUnder("all", mailTool("list_folders", "read"));

    expect(mail.calls).toEqual([]);
    expect(typesOf(runs.logs.get("run_1"))).toContain("approval.requested");
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
  });

  it("runs a read tool the file doesn't put under approve without asking", async () => {
    const { runs, mail } = await callingUnder(["send_mail"], mailTool("search", "read"));

    expect(mail.calls).toHaveLength(1);
    expect(typesOf(runs.logs.get("run_1"))).not.toContain("approval.requested");
  });
});

verifies("engine.unknown-outcome", () => {
  it("waits for a person when the call fails, and makes it again with the same key on retry", async () => {
    let failures = 1;
    const { executor, scheduler, runs, mail } = await waitingForOk(() => {
      if (failures-- > 0) throw new Error("connection reset");
      return "Sent";
    });

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(mail.calls).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({
      status: "waiting",
      accepts: ["retry", "skip"],
    });
    expect(eventsOf(runs.logs.get("run_1"), "tool.result")).toMatchObject([
      { outcome: "unknown", result: expect.stringContaining("connection reset") },
    ]);

    await executor.send("run_1", "retry", undefined, { callId: "call-4" });
    await scheduler.runDue();

    expect(mail.calls).toHaveLength(2);
    expect(mail.idempotencyKeys).toEqual(["run_1:call-4", "run_1:call-4"]);
    const keys = eventsOf(runs.logs.get("run_1"), "effect.requested").map(
      (event) => event.type === "effect.requested" && event.idempotencyKey,
    );
    expect(keys).toEqual(["run_1:call-4", "run_1:call-4"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("doesn't make the call on retry when sending was switched off since, and gives the model the reason", async () => {
    const { executor, scheduler, runs, mail, model, settings } = await waitingForOk(() => {
      throw new Error("connection reset");
    });
    await executor.send("run_1", "approve");
    await scheduler.runDue();
    settings.check = sendingOff;

    await executor.send("run_1", "retry", undefined, { callId: "call-4" });
    await scheduler.runDue();

    expect(mail.calls).toHaveLength(1);
    expect(eventsOf(runs.logs.get("run_1"), "tool.result")).toMatchObject([
      { outcome: "unknown" },
      {
        outcome: "error",
        result: expect.stringContaining('sending is off for the connector "mail"'),
      },
    ]);
    expect(lastResult(model)).toContain('sending is off for the connector "mail"');
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("breaks the call off with an unknown outcome when its time limit is up", async () => {
    const { executor, scheduler, runs, mail } = await waitingForOk();
    mail.callTool = () => new Promise<string>(() => {});

    await executor.send("run_1", "approve");
    await scheduler.deliver("run_1", "call:call-3");
    const calling = scheduler.deliver("run_1", "tool:call-4");
    await scheduler.deliver("run_1", "start:connector:call-4");
    await calling;

    expect(eventsOf(runs.logs.get("run_1"), "tool.result")).toMatchObject([
      { outcome: "unknown", result: expect.stringContaining("took longer than 60 seconds") },
    ]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "waiting",
      accepts: ["retry", "skip"],
    });
  });
});
