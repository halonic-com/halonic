import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  textAnswer,
} from "../testing/scripted-model.ts";
import {
  callerTool,
  halonicTool,
  MemoryTurnLog,
  runTestTurn,
} from "./turn-test-kit.test-helper.ts";

verifies("engine.turn-refusals-as-data", () => {
  it("leaves out a server whose listing fails and refuses its listing", async () => {
    const broken = new ScriptedConnector("drive", new Error("offline"));
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const { model, result } = await runTestTurn({
      answers: [textAnswer("Hello")],
      connectors: [broken, mail],
    });

    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["lookup"]);
    expect(JSON.stringify(model.requests[0]?.messages)).not.toContain("offline");
    expect(result.refusals).toEqual([
      { source: "drive", refused: "listing", reason: "couldn't list its tools: offline" },
    ]);
  });

  it("refuses a call to a tool nobody offered and tells the model", async () => {
    const { model, result } = await runTestTurn({
      answers: [callAnswer(call("c1", "delete_everything")), textAnswer("Sorry")],
    });

    expect(model.requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      toolCallId: "c1",
      name: "delete_everything",
      content: "Refused: no tool of that name was offered",
    });
    expect(result.refusals).toEqual([
      {
        source: "halonic",
        name: "delete_everything",
        refused: "call",
        reason: "no tool of that name was offered",
      },
    ]);
  });

  it("cuts a long error text from a server in a listing refusal", async () => {
    const broken = new ScriptedConnector("drive", new Error("x".repeat(500)));
    const { result } = await runTestTurn({ answers: [textAnswer("Hello")], connectors: [broken] });

    expect(result.refusals[0]?.reason).toBe(`couldn't list its tools: ${"x".repeat(200)}…`);
  });
});

verifies("engine.turn-tool-error", () => {
  it("gives the model the error of a tool that throws, logs it and goes on", async () => {
    const log = new MemoryTurnLog();
    const mail = new ScriptedConnector("mail", [listedTool("lookup")], () => {
      throw new Error("timed out");
    });
    const { model, result } = await runTestTurn({
      answers: [callAnswer(call("c1", "lookup")), textAnswer("It failed")],
      connectors: [mail],
      log,
    });

    expect(model.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      content: "The tool lookup failed: timed out",
    });
    expect(log.events).toContainEqual({
      type: "tool.result",
      agent: "clerk",
      tool: "lookup",
      result: "The tool lookup failed: timed out",
      outcome: "error",
    });
    expect(result.content).toBe("It failed");
  });

  it("names a thrown value that isn't an Error", async () => {
    const failing = halonicTool("remember", () => Promise.reject("disk full"));
    const { result } = await runTestTurn({
      answers: [callAnswer(call("c1", "remember")), textAnswer("Oops")],
      halonicTools: [failing],
    });

    expect(result.turn[1]).toMatchObject({ content: "The tool remember failed: disk full" });
  });
});

verifies("engine.turn-tool-names", () => {
  it("keeps the caller's tool and refuses a server's tool with the same name", async () => {
    const mail = new ScriptedConnector("mail", [listedTool("search"), listedTool("lookup")]);
    const { model, result } = await runTestTurn({
      answers: [callAnswer(call("c1", "search"))],
      callerTools: [callerTool("search")],
      connectors: [mail],
    });

    expect(model.requests[0]?.tools?.map((tool) => tool.description)).toEqual([
      "Picks with search",
      "Does lookup",
    ]);
    expect(mail.calls).toEqual([]);
    expect(result.toolCalls).toEqual([call("c1", "search")]);
    expect(result.refusals).toEqual([
      {
        source: "mail",
        name: "search",
        refused: "tool",
        reason: 'mail offers a tool named "search", which caller already offers',
      },
    ]);
  });

  it("keeps Halonic's tool over a server's and the first server's over a later one", async () => {
    const first = new ScriptedConnector("mail", [listedTool("remember"), listedTool("lookup")]);
    const second = new ScriptedConnector("drive", [listedTool("lookup")]);
    const { model, result } = await runTestTurn({
      answers: [textAnswer("Hello")],
      halonicTools: [halonicTool("remember", async () => "ok")],
      connectors: [first, second],
    });

    expect(model.requests[0]?.tools?.map((tool) => tool.description)).toEqual([
      "Halonic remember",
      "Does lookup",
    ]);
    expect(result.refusals.map((refusal) => refusal.reason)).toEqual([
      'mail offers a tool named "remember", which halonic already offers',
      'drive offers a tool named "lookup", which mail already offers',
    ]);
  });
});

verifies("engine.turn-logs-risk", () => {
  const sendEmail = { ...listedTool("send_email"), risk: "send" } as const;

  it("copies a listed tool's risk into the result of a call that answered", async () => {
    const log = new MemoryTurnLog();
    await runTestTurn({
      answers: [callAnswer(call("c1", "send_email")), textAnswer("Sent")],
      connectors: [new ScriptedConnector("mail", [sendEmail])],
      log,
    });

    expect(log.events).toContainEqual({
      type: "tool.result",
      agent: "clerk",
      tool: "send_email",
      result: "send_email done",
      outcome: "ok",
      risk: "send",
    });
  });

  it("keeps the risk on the result of a call that failed", async () => {
    const log = new MemoryTurnLog();
    const mail = new ScriptedConnector("mail", [sendEmail], () => {
      throw new Error("timed out");
    });
    await runTestTurn({
      answers: [callAnswer(call("c1", "send_email")), textAnswer("It failed")],
      connectors: [mail],
      log,
    });

    expect(log.events).toContainEqual(
      expect.objectContaining({ type: "tool.result", outcome: "error", risk: "send" }),
    );
  });

  it("leaves the risk out when the listing gives none, and for Halonic's own tools", async () => {
    const log = new MemoryTurnLog();
    await runTestTurn({
      answers: [callAnswer(call("c1", "lookup"), call("c2", "remember")), textAnswer("Done")],
      connectors: [new ScriptedConnector("mail", [listedTool("lookup")])],
      halonicTools: [halonicTool("remember", () => Promise.resolve("kept"))],
      log,
    });

    const results = log.events.filter((event) => event.type === "tool.result");
    expect(results.map((event) => event.tool)).toEqual(["lookup", "remember"]);
    for (const result of results) {
      expect(result).not.toHaveProperty("risk");
    }
  });
});
