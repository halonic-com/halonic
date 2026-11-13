import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ToolNoun, ToolOutcome, ToolRisk, ToolVerb } from "./run-basics.ts";
import type { RunEvent, RunEventBody } from "./run-event.ts";
import { draftsOf, readsOf } from "./run-reads.ts";

const email: ToolNoun = { one: "email", many: "emails" };
const file: ToolNoun = { one: "Drive file", many: "Drive files" };

function runLog(...bodies: RunEventBody[]): RunEvent[] {
  return bodies.map((body, index) => ({
    runId: "r",
    seq: index + 1,
    at: `T${index + 1}`,
    ...body,
  }));
}

function call(fields: {
  outcome?: ToolOutcome;
  risk?: ToolRisk;
  noun?: ToolNoun;
  verb?: ToolVerb;
}): RunEventBody {
  return { type: "tool.result", agent: "a", tool: "a_tool", result: "done", ...fields };
}

verifies("events.summary-reads", () => {
  it("counts ok reads per noun in call order", () => {
    const log = runLog(
      call({ outcome: "ok", risk: "read", noun: email }),
      call({ outcome: "ok", risk: "read", noun: file }),
      call({ outcome: "ok", risk: "read", noun: email }),
    );
    expect(readsOf(log)).toStrictEqual([
      { noun: email, calls: 2 },
      { noun: file, calls: 1 },
    ]);
  });

  it("leaves out reads that failed, broke off or have no noun", () => {
    const log = runLog(
      call({ outcome: "error", risk: "read", noun: email }),
      call({ outcome: "unknown", risk: "read", noun: email }),
      call({ outcome: "ok", risk: "read" }),
    );
    expect(readsOf(log)).toStrictEqual([]);
  });

  it("counts an ok write call with the verb drafted as a draft", () => {
    const log = runLog(call({ outcome: "ok", risk: "write", noun: email, verb: "drafted" }));
    expect(draftsOf(log)).toStrictEqual([{ noun: email, calls: 1 }]);
  });

  it("never counts a send as a draft", () => {
    const log = runLog(call({ outcome: "ok", risk: "send", noun: email, verb: "drafted" }));
    expect(draftsOf(log)).toStrictEqual([]);
  });
});
