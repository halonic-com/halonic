import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { accepted, callAction, fakePaperclip, task } from "./paperclip-writes.test-helper.ts";

const blockedStep = {
  task: "HAL-16403",
  status: "blocked",
  blockedBy: ["HAL-16989"],
  comment: "Waits on the server patch.",
};
const inProgressStep = {
  task: "HAL-16403",
  status: "in_progress",
  monitor: { inMinutes: 20, ref: "halonic-com/halonic#5486" },
  comment: "Pushed; CI runs.",
};

verifies("runtime.paperclip-writes", () => {
  describe("in dry run", () => {
    test.each([
      ["paperclip.comment", { task: "HAL-16403", body: "Hello." }],
      ["paperclip.next-step", blockedStep],
      ["paperclip.finish-run", { task: "HAL-16403", outcome: "done", comment: "Merged." }],
    ] as const)("%s answers its writes and calls no write client", async (action, params) => {
      const { host } = fakePaperclip({ writesAllowed: false });
      const result = await callAction(host, action, params, { mode: "dry-run" });
      expect(result.error).toBeUndefined();
      expect(result.content).toMatch(/^Dry run: would .+ Nothing was written;/);
      expect(result.data).toMatchObject({ mode: "dry-run", task: "HAL-16403" });
    });

    test("answers the exact payload a write would send", async () => {
      const { host } = fakePaperclip({ writesAllowed: false });
      const result = await callAction(host, "paperclip.next-step", blockedStep, {
        mode: "dry-run",
      });
      expect(result.data).toEqual({
        mode: "dry-run",
        task: "HAL-16403",
        writes: [
          {
            kind: "disposition",
            issueId: "task-16403",
            patch: {
              status: "blocked",
              blockedByIssueIds: ["task-16989"],
              comment: "Waits on the server patch.",
              monitor: null,
            },
          },
        ],
      });
      expect(result.content).toBe(
        "Dry run: would set HAL-16403 to blocked, blocked by task-16989, with your comment. Nothing was written; the tool file sets mode: write when it goes live.",
      );
    });

    test.each([
      ["no mode", null],
      ["an unknown mode", { mode: "always" }],
    ])("treats %s in the tool file as dry run", async (_case, settings) => {
      const { host } = fakePaperclip({ writesAllowed: false });
      const result = await callAction(
        host,
        "paperclip.comment",
        { task: "HAL-16403", body: "Hi." },
        settings,
      );
      expect(result.data).toMatchObject({ mode: "dry-run" });
    });

    test("ignores a mode in the agent's parameters", async () => {
      const { host } = fakePaperclip({ writesAllowed: false });
      const params = { task: "HAL-16403", body: "Hi.", mode: "write", with: { mode: "write" } };
      const result = await callAction(host, "paperclip.comment", params, { mode: "dry-run" });
      expect(result.data).toMatchObject({ mode: "dry-run" });
    });

    test("refuses what a write would refuse", async () => {
      const { host } = fakePaperclip({ writesAllowed: false });
      const result = await callAction(
        host,
        "paperclip.next-step",
        { ...blockedStep, task: "HAL-16989" },
        { mode: "dry-run" },
      );
      expect(result.error).toBe("HAL-16989 isn't yours: this tool only changes a task you hold.");
    });
  });

  describe("in write mode", () => {
    test("comment posts one comment as the caller", async () => {
      const { host, received } = fakePaperclip();
      const result = await callAction(host, "paperclip.comment", {
        task: "HAL-16403",
        body: "Hi.",
      });
      expect(received).toEqual([
        {
          method: "createComment",
          args: ["task-16403", "Hi.", "acme", { authorAgentId: "agent-tomas" }],
        },
      ]);
      expect(result.content).toBe(
        "On HAL-16403: posted comment comment-new. A comment wakes nobody: to hand the task on, use finish_run.",
      );
    });

    test("next-step sends one setDisposition with the monitor when the host has it", async () => {
      const { host, received } = fakePaperclip({
        disposition: (patch) =>
          accepted({
            ...task,
            status: "in_progress",
            monitorNextCheckAt: patch.monitor?.nextCheckAt,
          }),
      });
      const result = await callAction(host, "paperclip.next-step", inProgressStep);
      expect(received).toEqual([
        {
          method: "setDisposition",
          args: [
            "task-16403",
            "acme",
            {
              status: "in_progress",
              comment: "Pushed; CI runs.",
              monitor: {
                nextCheckAt: "2026-11-23T14:20:00.000Z",
                notes: "Set with set_next_step: every 20 minutes, at most 4 checks.",
                scheduledBy: "assignee",
                kind: "external_service",
                serviceName: "github",
                externalRef: "halonic-com/halonic#5486",
                timeoutAt: "2026-11-23T15:40:00.000Z",
                maxAttempts: 4,
              },
            },
          ],
        },
      ]);
      expect(result.content).toBe(
        "On HAL-16403: set it to in_progress with your comment; next monitor check: 2026-11-23T14:20:00.000Z. A comment wakes nobody: to hand the task on, use finish_run.",
      );
    });

    test("without setDisposition, posts the comment first, then one plain update as the run", async () => {
      const { host, received } = fakePaperclip({ disposition: false });
      await callAction(host, "paperclip.finish-run", {
        task: "HAL-16403",
        outcome: "handoff",
        to: "liam",
        comment: "Ready for review.",
      });
      expect(received).toEqual([
        {
          method: "createComment",
          args: ["task-16403", "Ready for review.", "acme", { authorAgentId: "agent-tomas" }],
        },
        {
          method: "update",
          args: [
            "task-16403",
            { status: "todo", assigneeAgentId: "agent-liam" },
            "acme",
            { actorAgentId: "agent-tomas", actorRunId: "run-1" },
          ],
        },
      ]);
    });

    test.each([
      [{ disposition: undefined }, { status: "done", comment: "Merged, green." }],
      [{ disposition: false as const }, { status: "done" }],
    ])("finish-run done sends only the status and comment (%j)", async (options, patch) => {
      const { host, received } = fakePaperclip(options);
      await callAction(host, "paperclip.finish-run", {
        task: "HAL-16403",
        outcome: "done",
        comment: "Merged, green.",
      });
      expect(received.at(-1)?.args).toContainEqual(patch);
    });

    test("passes Paperclip's refusal on with its status, code and message", async () => {
      const { host } = fakePaperclip({
        disposition: () => ({
          ok: false,
          status: 422,
          body: { error: "No review path for in_review.", code: "invalid_issue_disposition" },
        }),
      });
      const result = await callAction(host, "paperclip.finish-run", {
        task: "HAL-16403",
        outcome: "done",
        comment: "Done.",
      });
      expect(result.error).toBe(
        "Paperclip refused (422) (invalid_issue_disposition): No review path for in_review.",
      );
    });
  });

  describe("refuses before anything is sent", () => {
    test.each([
      ["paperclip.comment", { task: "HAL-16403", body: "  " }, "body must be the comment's text."],
      [
        "paperclip.comment",
        { task: "HAL-16403", body: "x".repeat(20_001) },
        "body is 20001 characters; the most is 20000. Put a longer text in a document.",
      ],
      [
        "paperclip.comment",
        { task: "HAL-99999", body: "Hello." },
        "no task HAL-99999 in this company, or the plugin may not read it.",
      ],
      [
        "paperclip.next-step",
        { task: "HAL-16403", status: "in_progress", comment: "Working." },
        "in_progress needs a monitor: nothing else wakes you once this run ends.",
      ],
      [
        "paperclip.next-step",
        { task: "HAL-16403", status: "blocked", comment: "Waiting." },
        "blockedBy must list 1 to 10 tasks that hold the work, such as ['HAL-16989'] or \"HAL-16989, HAL-17012\", never a parent epic.",
      ],
      [
        "paperclip.next-step",
        { task: "HAL-16403", status: "in_progress", to: "Liam", comment: "Over to Liam." },
        "set_next_step never hands a task on: call finish_run with outcome handoff as your run's last step.",
      ],
      [
        "paperclip.finish-run",
        { task: "HAL-16403", outcome: "blocked", blockedBy: ["HAL-99999"], comment: "Waiting." },
        "no task HAL-99999 in this company, or the plugin may not read it.",
      ],
      [
        "paperclip.finish-run",
        { task: "HAL-16403", outcome: "handoff", to: "Nobody", comment: "Over." },
        "no agent named Nobody in this company.",
      ],
      [
        "paperclip.finish-run",
        { task: "HAL-16403", outcome: "handoff", to: "Tomas", comment: "Mine." },
        "the task is already yours: to keep working, call set_next_step instead.",
      ],
      [
        "paperclip.finish-run",
        { task: "HAL-16989", outcome: "done", comment: "Done." },
        "HAL-16989 isn't yours: this tool only changes a task you hold.",
      ],
    ] as const)("%s refuses %j", async (action, params, message) => {
      for (const disposition of [undefined, false as const]) {
        const { host, received } = fakePaperclip({ disposition });
        expect(await callAction(host, action, params)).toEqual({ error: message });
        expect(received).toEqual([]);
      }
    });

    test("without setDisposition, in_progress is refused: no monitor can be set", async () => {
      const { host, received } = fakePaperclip({ disposition: false });
      const result = await callAction(host, "paperclip.next-step", inProgressStep);
      expect(result.error).toBe(
        "in_progress needs a monitor, and this Paperclip doesn't let a plugin set one: set the task's monitor yourself.",
      );
      expect(received).toEqual([]);
    });
  });
});
