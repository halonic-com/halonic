import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HarnessEvent } from "@halonicjs/ports";
import { secretRemoved } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { AppServerMessage } from "./app-server-client.ts";
import { bridgeToken, item, threadId } from "./app-server-events.test-helper.ts";
import { AppServerEventReader } from "./app-server-events.ts";
import { PendingApprovals } from "./approvals.ts";

/** The messages Codex sent on its own in a recorded run in `fixtures/`, in order. */
function recordedMessages(name: string): AppServerMessage[] {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((message) => typeof message["method"] === "string")
    .map((message) => {
      const { id, method, params } = message as { id?: number; method: string; params: unknown };
      return id === undefined
        ? { kind: "notification", method, params }
        : { kind: "request", id, method, params };
    });
}

/** Reads `messages` as the run does: notifications through the reader, approval requests through both. */
function readMessages(messages: readonly AppServerMessage[], thread = threadId) {
  const reader = new AppServerEventReader({ agentId: "writer", bridgeToken, threadId: thread });
  const approvals = new PendingApprovals();
  const events: HarnessEvent[] = [];
  for (const message of messages) {
    const request = approvals.add(message);
    if (request !== undefined) events.push(...reader.approvalRequested(request));
    else if (message.kind === "notification") events.push(...reader.read(message));
  }
  return { events, approvals };
}

function commandApproval(fields: Record<string, unknown>, id = 7): AppServerMessage {
  return {
    kind: "request",
    id,
    method: "item/commandExecution/requestApproval",
    params: { threadId, turnId: "turn-1", itemId: "call-1", startedAtMs: 1, ...fields },
  };
}

const notification = (message: { method: string; params: unknown }): AppServerMessage => ({
  kind: "notification",
  ...message,
});

verifies("harness-codex.approvals", () => {
  describe("a recorded run of Codex 0.166.0 whose rules ask for an OK", () => {
    it("asks for an OK for the command, between its tool.called and its declined tool.result", () => {
      const messages = recordedMessages("codex-0.166.0-approval.jsonl");
      const thread = messages.find(({ method }) => method === "turn/started")?.params as {
        threadId: string;
      };
      const { events } = readMessages(messages, thread.threadId);

      const args = { command: "/bin/bash -lc 'touch made-up.txt'", cwd: "/workspace" };
      expect(events.slice(0, 3)).toEqual([
        { type: "tool.called", agent: "writer", tool: "shell", args },
        { type: "approval.requested", agent: "writer", tool: "shell", args, callId: "call_1" },
        { type: "tool.result", agent: "writer", tool: "shell", result: "", outcome: "error" },
      ]);
      expect(events.at(-1)).toEqual({ type: "agent.finished", agent: "writer", output: "Done." });
    });

    it("answers the person's decision to the request it came in", () => {
      const { approvals } = readMessages(recordedMessages("codex-0.166.0-approval.jsonl"));

      expect(approvals.answer("call_1", false)).toEqual({
        id: 0,
        result: { decision: "decline" },
      });
    });
  });

  describe("PendingApprovals", () => {
    it("answers an OK with accept, and then no longer waits", () => {
      const approvals = new PendingApprovals();
      approvals.add(commandApproval({ command: "touch a" }));

      expect(approvals.answer("call-1", true)).toEqual({ id: 7, result: { decision: "accept" } });
      expect(() => approvals.answer("call-1", true)).toThrow(
        'No approval with call id "call-1" is waiting.',
      );
    });

    it("names a request by its approval id when one command asks more than once", () => {
      const approvals = new PendingApprovals();
      const request = approvals.add(commandApproval({ approvalId: "approval-2" }, 8));

      expect(request?.callId).toBe("approval-2");
      expect(approvals.answer("approval-2", true).id).toBe(8);
    });

    it("forgets a request Codex says is resolved", () => {
      const approvals = new PendingApprovals();
      approvals.add(commandApproval({}));
      approvals.forget(7);

      expect(() => approvals.answer("call-1", false)).toThrow("is waiting");
    });

    it("keeps only approval requests", () => {
      const approvals = new PendingApprovals();
      const question = { threadId, turnId: "turn-1", itemId: "call-1", questions: [] };

      expect(
        approvals.add({
          kind: "request",
          id: 1,
          method: "item/tool/requestUserInput",
          params: question,
        }),
      ).toBeUndefined();
      expect(
        approvals.add({
          kind: "notification",
          method: "item/commandExecution/requestApproval",
          params: question,
        }),
      ).toBeUndefined();
      expect(approvals.add(commandApproval({ threadId: 5 }))).toBeUndefined();
      expect(approvals.add({ ...commandApproval({}), params: null })).toBeUndefined();
    });
  });

  describe("AppServerEventReader: approval.requested", () => {
    it("asks for a file change with the changes its item started with", () => {
      const changes = [{ path: "/workspace/note.txt", kind: { type: "add" }, diff: "Teal.\n" }];
      const { events } = readMessages([
        notification(item("item/started", { type: "fileChange", id: "call-2", changes })),
        {
          kind: "request",
          id: 3,
          method: "item/fileChange/requestApproval",
          params: { threadId, turnId: "turn-1", itemId: "call-2", startedAtMs: 1 },
        },
      ]);

      expect(events[1]).toEqual({
        type: "approval.requested",
        agent: "writer",
        tool: "apply_patch",
        args: { changes: [{ path: "/workspace/note.txt", kind: "add", diff: "Teal.\n" }] },
        callId: "call-2",
      });
    });

    it("takes the command from the request when its item hasn't started yet", () => {
      const { events } = readMessages([commandApproval({ command: "ls", cwd: "/workspace" })]);

      expect(events).toEqual([
        {
          type: "approval.requested",
          agent: "writer",
          tool: "shell",
          args: { command: "ls", cwd: "/workspace" },
          callId: "call-1",
        },
      ]);
    });

    it("keeps the bridge token out of the request", () => {
      const { events } = readMessages([commandApproval({ command: `echo ${bridgeToken}` })]);

      expect(events[0]).toMatchObject({ args: { command: `echo ${secretRemoved}`, cwd: "" } });
    });

    it("gives no event for another thread's request", () => {
      expect(readMessages([commandApproval({ threadId: "thread-other" })]).events).toEqual([]);
    });
  });
});
