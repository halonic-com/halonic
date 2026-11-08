import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  APPROVAL_EVENTS,
  approvalComment,
  approvalDecision,
  REJECTED_TOOL_RESULT,
  revisedToolResult,
} from "./approvals.ts";

verifies("workflow.approval-decision", () => {
  // Ported from "tool approvals" › "maps approve and reject to a decision and
  // ignores other events" at 784f78d.
  it("maps approve and reject to a decision and ignores other events", () => {
    expect(APPROVAL_EVENTS).toEqual(["approve", "reject"]);
    expect(approvalDecision("approve")).toBe(true);
    expect(approvalDecision("reject")).toBe(false);
    expect(approvalDecision("done")).toBeNull();
  });

  it("matches the event names exactly", () => {
    expect(approvalDecision("Approve")).toBeNull();
    expect(approvalDecision(" reject")).toBeNull();
    expect(approvalDecision("")).toBeNull();
  });
});

verifies("workflow.approval-rejected-result", () => {
  it("tells the agent not to try the call again, word for word", () => {
    expect(REJECTED_TOOL_RESULT).toBe(
      "A person rejected this tool call. Do not try it again; continue without it.",
    );
  });
});

verifies("workflow.approval-asks-for-changes", () => {
  it("reads the comment without the spaces around it", () => {
    expect(approvalComment({ comment: "Use the formal tone." })).toBe("Use the formal tone.");
    expect(approvalComment({ comment: "  Use the formal tone.\n" })).toBe("Use the formal tone.");
  });

  it("finds no comment in a payload without comment text", () => {
    expect(approvalComment({ comment: "   " })).toBeNull();
    expect(approvalComment({ comment: "" })).toBeNull();
    expect(approvalComment({ comment: 42 })).toBeNull();
    expect(approvalComment({ note: "Use the formal tone." })).toBeNull();
  });

  it("finds no comment when there is no payload object", () => {
    expect(approvalComment(undefined)).toBeNull();
    expect(approvalComment(null)).toBeNull();
    expect(approvalComment("Use the formal tone.")).toBeNull();
  });

  it("tells the agent what to change and that the new call needs approval, word for word", () => {
    expect(revisedToolResult("Use the formal tone.")).toBe(
      'A person did not approve this tool call yet and asks for changes: "Use the formal tone.". Change only what they asked, then call the tool again; the new call needs their approval too.',
    );
  });
});
