import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ToolNoun, ToolOutcome, ToolRisk, ToolVerb } from "./run-basics.ts";
import type { RunEvent, RunEventBody } from "./run-event.ts";
import { sendsOf } from "./run-sends.ts";

const email: ToolNoun = { one: "email", many: "emails" };
const invite: ToolNoun = { one: "invite", many: "invites" };
const file: ToolNoun = { one: "file", many: "files" };

/** A run log of run "r" with the given bodies, numbered from 1. */
function runLog(...bodies: RunEventBody[]): RunEvent[] {
  return bodies.map((body, index) => ({
    runId: "r",
    seq: index + 1,
    at: `T${index + 1}`,
    ...body,
  }));
}

interface CallResult {
  tool?: string;
  outcome?: ToolOutcome;
  risk?: ToolRisk;
  noun?: ToolNoun;
  verb?: ToolVerb;
}

/** The `tool.result` of one call, with only the fields given. */
function result(fields: CallResult): RunEventBody {
  return { type: "tool.result", agent: "writer", tool: "a_tool", result: "done", ...fields };
}

/** The `tool.result` of an ok call of a sending tool. */
function sent(noun: ToolNoun, verb?: ToolVerb): RunEventBody {
  return result({ outcome: "ok", risk: "send", noun, ...(verb === undefined ? {} : { verb }) });
}

verifies("events.summary-sends", () => {
  it("groups by verb and counts by noun, both in call order", () => {
    const sends = sendsOf(
      runLog(sent(email), sent(invite), sent(file, "saved"), sent(invite), sent(email, "sent")),
    );
    expect(sends.sent).toStrictEqual([
      {
        verb: "sent",
        counts: [
          { noun: email, calls: 2 },
          { noun: invite, calls: 2 },
        ],
      },
      { verb: "saved", counts: [{ noun: file, calls: 1 }] },
    ]);
    expect(sends.maySend).toStrictEqual([]);
    expect(sends.madeToolCalls).toBe(true);
  });

  it("adds up calls of different tools with the same verb and noun", () => {
    const sends = sendsOf(
      runLog(
        result({ tool: "gmail_send", outcome: "ok", risk: "send", noun: email }),
        result({ tool: "gmail_send_draft", outcome: "ok", risk: "send", noun: email }),
      ),
    );
    expect(sends.sent).toStrictEqual([{ verb: "sent", counts: [{ noun: email, calls: 2 }] }]);
  });

  it("puts a call that broke off in what may have been sent, not in what was sent", () => {
    const sends = sendsOf(
      runLog(
        sent(email),
        result({ outcome: "unknown", risk: "send", noun: file, verb: "moved" }),
        result({ outcome: "unknown", risk: "send", noun: email }),
      ),
    );
    expect(sends.sent).toStrictEqual([{ verb: "sent", counts: [{ noun: email, calls: 1 }] }]);
    expect(sends.maySend).toStrictEqual([
      { verb: "moved", counts: [{ noun: file, calls: 1 }] },
      { verb: "sent", counts: [{ noun: email, calls: 1 }] },
    ]);
  });

  it("leaves out failed calls, sends without a noun or outcome, and other risks", () => {
    const sends = sendsOf(
      runLog(
        result({ outcome: "error", risk: "send", noun: email }),
        result({ outcome: "ok", risk: "send" }),
        result({ risk: "send", noun: email }),
        result({ outcome: "ok", risk: "write", noun: file }),
        result({ outcome: "ok" }),
      ),
    );
    expect(sends).toStrictEqual({ sent: [], maySend: [], madeToolCalls: true });
  });

  it("says a run without tool calls made none", () => {
    const sends = sendsOf(runLog({ type: "state.entered", state: "draft" }));
    expect(sends).toStrictEqual({ sent: [], maySend: [], madeToolCalls: false });
  });

  it("counts a tool call that has no result yet as a call", () => {
    const sends = sendsOf(runLog({ type: "tool.called", agent: "writer", tool: "t", args: {} }));
    expect(sends.madeToolCalls).toBe(true);
  });

  it("counts starting a child run as a call, because the child may have sent", () => {
    const sends = sendsOf(
      runLog({ type: "workflow.started", state: "send", workflow: "mail", childRunId: "c" }),
    );
    expect(sends).toStrictEqual({ sent: [], maySend: [], madeToolCalls: true });
  });

  it("keeps the counts apart from the log's nouns", () => {
    const noun = { one: "email", many: "emails" };
    const sends = sendsOf(runLog(sent(noun)));
    noun.one = "changed";
    expect(sends.sent[0]?.counts[0]?.noun).toStrictEqual(email);
  });
});
