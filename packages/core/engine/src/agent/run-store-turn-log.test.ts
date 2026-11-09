import type { RunEvent } from "@halonicjs/events";
import type { AppendResult, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  textAnswer,
} from "../testing/scripted-model.ts";
import { RunStoreTurnLog } from "./run-store-turn-log.ts";
import { runTestTurn, steppingClock } from "./turn-test-kit.test-helper.ts";

/** The append of a run store, for one run, with the store's check on `expectedSeq`. */
class OneRunStore implements Pick<RunStore, "append"> {
  readonly events: RunEvent[] = [];

  async append(
    _runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
  ): Promise<AppendResult> {
    if (expectedSeq !== this.events.length) {
      return { ok: false, reason: "conflict", lastSeq: this.events.length };
    }
    this.events.push(...events);
    return { ok: true, lastSeq: this.events.length };
  }
}

verifies("engine.turn-logs-events", () => {
  it("numbers and stamps a turn's events after the run's last event", async () => {
    const store = new OneRunStore();
    store.events.push({
      runId: "run_1",
      seq: 1,
      at: "2026-01-05T08:59:00.000Z",
      type: "state.entered",
      state: "triage",
    });
    const log = new RunStoreTurnLog(store, "run_1", 1, steppingClock());
    await runTestTurn({
      answers: [callAnswer(call("c1", "lookup")), textAnswer("Found it")],
      connectors: [new ScriptedConnector("mail", [listedTool("lookup")])],
      log,
    });

    expect(store.events.map((event) => [event.seq, event.type])).toEqual([
      [1, "state.entered"],
      [2, "llm.request"],
      [3, "llm.response"],
      [4, "tool.called"],
      [5, "tool.result"],
      [6, "llm.request"],
      [7, "llm.response"],
    ]);
    expect(store.events[1]).toMatchObject({ runId: "run_1", at: "2026-01-05T09:00:00.000Z" });
    expect(log.lastSeq).toBe(7);
  });

  it("stops the turn when another writer moved the log on", async () => {
    const store = new OneRunStore();
    const log = new RunStoreTurnLog(store, "run_1", 0, steppingClock());
    store.events.push({
      runId: "run_1",
      seq: 1,
      at: "2026-01-05T08:59:00.000Z",
      type: "state.entered",
      state: "triage",
    });

    await expect(runTestTurn({ answers: [textAnswer("Hello")], log })).rejects.toThrow(
      "The log of run run_1 moved on to event 1 while a model turn wrote to it after event 0.",
    );
  });
});
