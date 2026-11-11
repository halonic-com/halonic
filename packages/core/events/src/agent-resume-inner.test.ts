import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { AgentResume } from "./agent-resume.ts";
import type { RunEventBody } from "./run-event.ts";
import { parseEventLine } from "./upgrade.ts";

type EventOf<T extends RunEventBody["type"]> = Extract<RunEventBody, { type: T }>;

/** Where an agent stopped at `call`, with `inner` when that call waits on a subagent. */
function resumeAt(call: string, inner?: AgentResume["inner"]): AgentResume {
  return {
    messages: [{ role: "user", content: `Do ${call}` }],
    calls: [{ id: `id-${call}`, name: call, arguments: { task: call } }],
    step: 1,
    ...(inner === undefined ? {} : { inner }),
  };
}

const header = {
  runId: "run-1",
  seq: 4,
  at: "2026-11-11T00:00:00.000Z",
  type: "approval.requested",
  state: "triage",
  agent: "writer",
  tool: "send_mail",
  args: { to: "someone@example.com" },
  callId: "call-2",
};

verifies("events.agent-resume-inner", () => {
  typeTest("lets a resume hold the subagent's own resume, and leave it out", () => {
    expectTypeOf<AgentResume["inner"]>().toEqualTypeOf<
      { agent: string; resume: AgentResume } | undefined
    >();
    expectTypeOf(
      resumeAt("delegate_checker", { agent: "checker", resume: resumeAt("search") }),
    ).toExtend<AgentResume>();
    expectTypeOf<EventOf<"approval.requested">["subagent"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<EventOf<"effect.requested">["subagent"]>().toEqualTypeOf<string | undefined>();
  });

  describe("a log line", () => {
    it("reads a resume two levels deep as written", () => {
      const reader = { agent: "reader", resume: resumeAt("send_mail") };
      const checker = { agent: "checker", resume: resumeAt("delegate_reader", reader) };
      const line = JSON.stringify({
        ...header,
        resume: resumeAt("delegate_checker", checker),
        subagent: "reader",
      });

      const event = parseEventLine(line);

      expect(event).toMatchObject({
        type: "approval.requested",
        agent: "writer",
        subagent: "reader",
      });
      const resume = (event as EventOf<"approval.requested">).resume;
      expect(resume.inner).toEqual(checker);
      expect(resume.inner?.resume.inner).toEqual(reader);
    });

    it("reads a line written before the fields existed as before", () => {
      const line = JSON.stringify({ ...header, resume: resumeAt("send_mail") });

      const event = parseEventLine(line) as EventOf<"approval.requested">;

      expect(event.subagent).toBeUndefined();
      expect(event.resume.inner).toBeUndefined();
      expect(event.resume.calls).toEqual([
        { id: "id-send_mail", name: "send_mail", arguments: { task: "send_mail" } },
      ]);
    });
  });
});
