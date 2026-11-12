import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runTestTurn, steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import { keepDefinitions } from "../kernel/kept-definitions.ts";
import {
  answer,
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  startInput,
} from "../kernel/kernel-test-kit.test-helper.ts";
import { callOf } from "../kernel/run-state.ts";
import { readRun, step } from "../kernel/step.ts";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  textAnswer,
} from "../testing/scripted-model.ts";
import { RunStoreTurnLog } from "./run-store-turn-log.ts";

/** A run of the reply workflow that waits on its writer's call, `call-1`, and a log for that call. */
async function callWaitedOn() {
  const runs = new KernelRuns();
  const blobs = new KernelBlobs();
  const version = await keepDefinitions(blobs, { workflow: replyWorkflow });
  await step({ runs, blobs }, "r-acme", startInput(version));
  const run = await readRun(runs, "r-acme");
  const pending = run === null ? null : callOf(run, "call-1");
  if (run === null || pending === null) {
    throw new Error("The reply run doesn't wait on call-1.");
  }
  const log = new RunStoreTurnLog(runs, run, pending, steppingClock());
  return { runs, blobs, log, lastSeq: run.lastSeq };
}

verifies("engine.turn-logs-events", () => {
  it("numbers and stamps a turn's events after the run's last event", async () => {
    const { runs, log, lastSeq } = await callWaitedOn();

    await runTestTurn({
      answers: [callAnswer(call("c1", "lookup")), textAnswer("Found it")],
      connectors: [new ScriptedConnector("mail", [listedTool("lookup")])],
      log,
    });

    const turn = runs.logs.get("r-acme")?.slice(lastSeq) ?? [];
    expect(turn.map((event) => [event.seq - lastSeq, event.type])).toEqual([
      [1, "llm.request"],
      [2, "llm.response"],
      [3, "tool.called"],
      [4, "tool.result"],
      [5, "llm.request"],
      [6, "llm.response"],
    ]);
    expect(turn[0]).toMatchObject({ runId: "r-acme", at: "2026-01-05T09:00:00.000Z" });
  });
});

verifies("engine.run-turn-log", () => {
  it("writes after another writer's event while the run still waits on the call", async () => {
    const { runs, log, lastSeq } = await callWaitedOn();
    await runs.append("r-acme", lastSeq, [
      {
        type: "tool.called",
        agent: "writer",
        tool: "Read",
        args: {},
        runId: "r-acme",
        seq: lastSeq + 1,
        at: "2026-01-05T08:59:00.000Z",
      },
    ]);

    await runTestTurn({ answers: [textAnswer("Hello")], log });

    expect(
      runs.logs
        .get("r-acme")
        ?.slice(lastSeq)
        .map((event) => event.type),
    ).toEqual(["tool.called", "llm.request", "llm.response"]);
  });

  it("stops the turn once the run no longer waits on the call", async () => {
    const { runs, blobs, log } = await callWaitedOn();
    await step({ runs, blobs }, "r-acme", answer("call-1", "Thanks!"));

    await expect(runTestTurn({ answers: [textAnswer("Hello")], log })).rejects.toThrow(
      "moved on from call call-1",
    );
  });
});
