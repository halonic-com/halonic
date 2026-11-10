import type { BridgeApprovalDecision, BridgeApprovalRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { approvePermissionTool, PermissionPromptTool } from "./permission-prompt.ts";

/** The tool over approvals that answer with `decide`, and the questions it asked. */
function promptWith(decide: () => Promise<BridgeApprovalDecision>) {
  const asked: BridgeApprovalRequest[] = [];
  const tool = new PermissionPromptTool({
    request: async (request) => {
      asked.push(request);
      return decide();
    },
  });
  const call = (args: Record<string, unknown>, name = approvePermissionTool) =>
    tool.call(name, args, new AbortController().signal);
  return { tool, call, asked };
}

const bashCall = { tool_name: "Bash", input: { command: "ls" }, tool_use_id: "toolu_1" };

verifies("harness-bridge.approvals", () => {
  describe("approve_permission", () => {
    it("is the one tool listed, with an object schema", async () => {
      const { tool } = promptWith(async () => ({ approved: true }));
      const listed = await tool.list();
      expect(listed.map((listedTool) => listedTool.name)).toEqual(["approve_permission"]);
      expect(listed[0]?.inputSchema).toMatchObject({ type: "object" });
    });

    it("asks about Claude Code's call and allows it unchanged once approved", async () => {
      const { call, asked } = promptWith(async () => ({ approved: true }));
      const result = await call(bashCall);
      expect(asked).toEqual([
        { callId: expect.stringMatching(/^bridge-/), tool: "Bash", args: { command: "ls" } },
      ]);
      expect(result.isError).toBe(false);
      expect(JSON.parse(result.text)).toEqual({
        behavior: "allow",
        updatedInput: { command: "ls" },
      });
    });

    it("denies a rejected call with the person's comment", async () => {
      const { call } = promptWith(async () => ({ approved: false, comment: "not in /etc" }));
      const result = await call(bashCall);
      expect(JSON.parse(result.text)).toEqual({
        behavior: "deny",
        message: "Refused: a person rejected the call and wrote: not in /etc",
      });
    });

    it("denies a call whose wait ended, and hides why it ended", async () => {
      const { call } = promptWith(() => Promise.reject(new Error("run_1 cancelled at /secret")));
      const result = await call(bashCall);
      expect(JSON.parse(result.text)).toEqual({
        behavior: "deny",
        message: "Refused: the wait for a person's OK ended without an answer",
      });
      expect(result.text).not.toContain("/secret");
    });

    it.each([
      ["no tool_name", { input: {} }],
      ["an input that isn't an object", { tool_name: "Bash", input: "ls" }],
    ])("answers a call with %s with an error, without asking", async (_name, args) => {
      const { call, asked } = promptWith(async () => ({ approved: true }));
      expect(await call(args)).toMatchObject({ isError: true });
      expect(asked).toEqual([]);
    });

    it("has no other tool", async () => {
      const { call, asked } = promptWith(async () => ({ approved: true }));
      expect(await call(bashCall, "read_issue")).toMatchObject({ isError: true });
      expect(asked).toEqual([]);
    });
  });
});
