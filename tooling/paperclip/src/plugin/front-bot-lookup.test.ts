import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test, vi } from "vitest";
import { allowedLogFields } from "../front-bot/log-record.ts";
import type { PrStatusResult } from "../front-bot/lookups.ts";
import {
  botOn,
  chatTaskId,
  chiefId,
  commentCreated,
  frontBotHarness,
  type HarnessOptions,
} from "./front-bot.test-helper.ts";
import { gitHubPrStatus, onlyWatchedRepo } from "./front-bot-lookup.ts";
import { isAutomaticNote } from "./front-bot-notes.ts";

const lookupsOn = { ...botOn, frontBotLookups: true };

const openPr: PrStatusResult = {
  kind: "pr_status",
  pr: 6129,
  state: "open",
  draft: false,
  ciOk: "success",
  mergeable: "yes",
  inQueue: false,
  approvedOnHead: true,
};

const prAnswer =
  "*Automatic answer · from PR status:* PR #6129: open; ci-ok green; no conflict; not in the merge queue; approved on its latest commit.";

/** A first reply Haiku would give, so a test sees whether the message went on to it. */
const firstReply = { reply: "About PR #6129. Depends on the merge queue." };

/** Runs one board message through the bot with the lookups on, unless the options say otherwise. */
async function ask(message: string, options: HarnessOptions = {}) {
  const harness = frontBotHarness({
    config: lookupsOn,
    pulls: { 6129: openPr },
    answers: [firstReply],
    ...options,
    message,
  });
  await harness.bot.onCommentCreated(commentCreated(harness.message.id));
  return harness;
}

/** The log records the bot wrote, as their metadata. */
function records(logs: { meta: unknown }[]): Record<string, unknown>[] {
  return logs.map((log) => log.meta as Record<string, unknown>);
}

verifies("paperclip.front-bot-lookups", () => {
  test("a PR status question gets the answer from GitHub, with its label, and no Haiku call", async () => {
    const harness = await ask("Is #6129 merged?");
    expect(harness.sourceReads).toEqual(["pr:6129"]);
    expect(harness.posted().map((comment) => comment.body)).toEqual([prAnswer]);
    expect(harness.requests).toEqual([]);
    expect(records(harness.logs)).toEqual([
      expect.objectContaining({ callType: "lookup_pr_status", outcome: "posted", costMicroUsd: 0 }),
    ]);
  });

  test("a run status question gets the answer from the task and its run", async () => {
    const harness = await ask("Is HAL-123 running?", {
      tasks: [
        {
          identifier: "HAL-123",
          status: "in_progress",
          activeRun: {
            status: "running",
            agentId: "agent-liam",
            startedAt: "2026-11-26T14:02:30Z",
          },
        },
      ],
    });
    expect(harness.sourceReads).toEqual(["task:HAL-123"]);
    expect(harness.posted().map((comment) => comment.body)).toEqual([
      "*Automatic answer · from run status:* HAL-123: in progress; Liam's run is under way, started 14:02 UTC.",
    ]);
    expect(harness.requests).toEqual([]);
  });

  test("the answer is the bot's own comment: on its list, and skipped by the other handlers", async () => {
    const harness = await ask("Is #6129 merged?");
    const answer = harness.posted()[0];
    const notes = harness.saved.get(
      JSON.stringify({
        scopeKind: "issue",
        scopeId: chatTaskId,
        namespace: "front-bot",
        stateKey: "notes",
      }),
    );
    expect(notes).toEqual({
      companyId: "acme",
      notes: [{ commentId: answer?.id, runId: "run-1", at: expect.any(String) }],
    });
    // Even before its id is saved, a comment with no author and the label is the bot's.
    const unsaved = { authorAgentId: null, authorUserId: null, body: prAnswer };
    expect(isAutomaticNote(unsaved, new Set())).toBe(true);
    expect(isAutomaticNote({ ...unsaved, authorUserId: "user-board" }, new Set())).toBe(false);
    await harness.bot.onCommentCreated(commentCreated(answer?.id ?? ""));
    expect(harness.sourceReads).toEqual(["pr:6129"]);
  });

  describe("must-fail: the setting off means no lookups", () => {
    test("lookups off, bot on: no source read, the first reply as before", async () => {
      const harness = await ask("Is #6129 merged?", { config: botOn });
      expect(harness.sourceReads).toEqual([]);
      expect(harness.requests).toHaveLength(1);
      expect(harness.posted().map((comment) => comment.body)).toEqual([
        `*Automatic note:* ${firstReply.reply}`,
      ]);
    });

    test("bot off, lookups on: nothing at all", async () => {
      const harness = await ask("Is #6129 merged?", {
        config: { ...lookupsOn, frontBotEnabled: false },
      });
      expect(harness.sourceReads).toEqual([]);
      expect(harness.requests).toEqual([]);
      expect(harness.posted()).toEqual([]);
      expect(harness.logs).toEqual([]);
    });

    test("a setting that isn't exactly true counts as off", async () => {
      const harness = await ask("Is #6129 merged?", {
        config: { ...botOn, frontBotLookups: "true" },
      });
      expect(harness.sourceReads).toEqual([]);
    });
  });

  test("must-fail: a write attempt reads nothing and answers nothing; the first reply goes on", async () => {
    const harness = await ask("Please merge #6129");
    expect(harness.sourceReads).toEqual([]);
    expect(harness.posted().map((comment) => comment.body)).toEqual([
      `*Automatic note:* ${firstReply.reply}`,
    ]);
    expect(records(harness.logs)[0]).toMatchObject({
      callType: "lookup",
      outcome: "handed_over",
      reason: "write_request",
    });
  });

  test("must-fail: a question outside the list reads nothing and leaves no lookup record", async () => {
    const harness = await ask("What are the CI failures on #6129?");
    expect(harness.sourceReads).toEqual([]);
    expect(records(harness.logs).map((record) => record["callType"])).toEqual(["first_reply"]);
  });

  describe("must-fail: no clean result, no answer; the message goes on to the agent", () => {
    const cases: [string, string, HarnessOptions, string][] = [
      ["GitHub fails", "Is #6130 merged?", {}, "lookup_failed"],
      [
        "the source gives another PR",
        "Is #6129 merged?",
        { pulls: { 6129: { ...openPr, pr: 6130 } } },
        "lookup_mismatch",
      ],
      ["no such task", "Is HAL-404 running?", {}, "lookup_not_found"],
      [
        "a run status with no fixed phrase",
        "Is HAL-123 running?",
        {
          tasks: [
            {
              identifier: "HAL-123",
              status: "in_progress",
              activeRun: { status: "failed", agentId: chiefId, startedAt: null },
            },
          ],
        },
        "lookup_unreadable",
      ],
      [
        "a run start time that isn't a date",
        "Is HAL-123 running?",
        {
          tasks: [
            {
              identifier: "HAL-123",
              status: "in_progress",
              activeRun: { status: "running", agentId: chiefId, startedAt: "not a date" },
            },
          ],
        },
        "lookup_unreadable",
      ],
      [
        "a task of another company",
        "Is HAL-123 running?",
        { tasks: [{ identifier: "HAL-123", companyId: "globex", status: "done" }] },
        "lookup_not_found",
      ],
    ];
    for (const [name, message, options, reason] of cases) {
      test(name, async () => {
        const harness = await ask(message, options);
        expect(harness.posted().map((comment) => comment.body)).toEqual([
          `*Automatic note:* ${firstReply.reply}`,
        ]);
        expect(records(harness.logs)[0]).toMatchObject({ outcome: "handed_over", reason });
      });
    }

    test("a source that hangs is given up after 8 seconds", async () => {
      vi.useFakeTimers();
      try {
        const harness = frontBotHarness({
          config: lookupsOn,
          pulls: { 6129: "hangs" },
          answers: [firstReply],
          message: "Is #6129 merged?",
        });
        const handled = harness.bot.onCommentCreated(commentCreated(harness.message.id));
        await vi.advanceTimersByTimeAsync(8_000);
        await handled;
        expect(records(harness.logs)[0]).toMatchObject({
          outcome: "handed_over",
          reason: "lookup_failed",
        });
        expect(harness.posted().map((comment) => comment.body)).toEqual([
          `*Automatic note:* ${firstReply.reply}`,
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("must-fail: a bare PR number is read only when the company watches one repository", () => {
    /** The PR status source on settings that watch `repos`, with a GitHub that records each request. */
    function source(repos: readonly string[]) {
      const fetch = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
        throw new Error("offline");
      });
      const ctx = {
        config: {
          get: async () => ({ githubToken: { type: "secret_ref", secretId: "token-ref" }, repos }),
        },
        secrets: { resolve: async () => "read-only-token" },
        http: { fetch },
      } as unknown as Parameters<typeof gitHubPrStatus>[0];
      return { read: gitHubPrStatus(ctx), fetch };
    }

    test("two watched repositories: refused before any GitHub request", async () => {
      const { read, fetch } = source(["halonic-com/halonic", "halonic-com/cloud"]);
      await expect(read("acme", 45)).rejects.toThrow("one repository");
      expect(fetch).not.toHaveBeenCalled();
    });

    test("one watched repository: the request goes to that repository", async () => {
      const { read, fetch } = source(["halonic-com/cloud"]);
      await expect(read("acme", 45)).rejects.toThrow();
      expect(String(fetch.mock.calls[0]?.[0])).toContain("/repos/halonic-com/cloud/pulls/45");
    });

    test("the rule itself", () => {
      expect(onlyWatchedRepo(["halonic-com/halonic"])).toBe("halonic-com/halonic");
      expect(onlyWatchedRepo(["halonic-com/halonic", "halonic-com/cloud"])).toBeUndefined();
      expect(onlyWatchedRepo([])).toBeUndefined();
    });
  });

  test("a task title shaped like a key reads no source", async () => {
    const harness = await ask("Is #6129 merged?", {
      title: `Deploy ghp_${"a1B2c3D4e5".repeat(4)}`,
    });
    expect(harness.sourceReads).toEqual([]);
    expect(harness.posted()).toEqual([]);
  });

  test("a message the agent already answered reads no source", async () => {
    const harness = frontBotHarness({
      config: lookupsOn,
      pulls: { 6129: openPr },
      message: "Is #6129 merged?",
    });
    harness.addComment({
      authorAgentId: chiefId,
      authorUserId: null,
      body: "Still open.",
      createdAt: new Date("2026-11-26T14:04:00Z"),
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.sourceReads).toEqual([]);
    expect(records(harness.logs)).toEqual([expect.objectContaining({ reason: "agent_answered" })]);
  });

  test("log records hold only the allowed fields, never the message or the answer", async () => {
    const harness = await ask("Is #6129 merged?");
    for (const record of records(harness.logs)) {
      expect(
        Object.keys(record).every((key) => (allowedLogFields as readonly string[]).includes(key)),
      ).toBe(true);
    }
    expect(JSON.stringify(harness.logs)).not.toContain("6129");
  });
});
