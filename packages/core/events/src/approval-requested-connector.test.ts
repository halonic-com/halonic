import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { parseEventLine } from "./upgrade.ts";

type ApprovalRequested = Extract<RunEventBody, { type: "approval.requested" }>;

const line = {
  runId: "run-1",
  seq: 4,
  at: "2026-11-17T00:00:00.000Z",
  type: "approval.requested",
  state: "triage",
  agent: "writer",
  tool: "send_mail",
  args: { to: "someone@example.com" },
  callId: "call-2",
  resume: { messages: [], calls: [], step: 0 },
};

verifies("events.approval-requested-connector", () => {
  typeTest("has an optional connector next to the tool", () => {
    expectTypeOf<ApprovalRequested["connector"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ApprovalRequested["tool"]>().toEqualTypeOf<string>();
  });

  describe("a log line", () => {
    it("reads the connector and the bare tool as written", () => {
      const event = parseEventLine(JSON.stringify({ ...line, connector: "mail" }));

      expect(event).toMatchObject({ tool: "send_mail", connector: "mail" });
    });

    it("reads a line written before the field existed, without a connector", () => {
      const event = parseEventLine(JSON.stringify(line)) as ApprovalRequested;

      expect(event.tool).toBe("send_mail");
      expect(event.connector).toBeUndefined();
    });
  });
});
