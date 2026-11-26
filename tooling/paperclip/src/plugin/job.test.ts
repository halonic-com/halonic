import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { gitHubReader } from "../pr-watcher/github.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import { loadSnapshot, saveSnapshot } from "../snapshot/store.ts";
import {
  type FakeIssue,
  fakeHost,
  fakeJobContext,
  mergedGreenOnGitHub,
} from "./fake-host.test-helper.ts";
import { readSettings, runWatcher } from "./job.ts";

const now = new Date("2026-11-22T07:20:00Z");
const token = { type: "secret_ref", secretId: "secret-pr-watcher" };

/** HAL-4485, held by Priya, whose pull request #4485 merged with a green ci-ok. */
const priyasTask: FakeIssue = {
  id: "task-4485",
  identifier: "HAL-4485",
  status: "in_progress",
  assigneeAgentId: "agent-priya",
};

function setUp(
  config: Record<string, unknown>,
  secret?: () => Promise<string>,
  unconfigured: readonly string[] = [],
) {
  const { host, writes } = fakeHost([priyasTask]);
  const job = fakeJobContext({
    host,
    configs: { acme: config },
    unconfigured,
    answers: mergedGreenOnGitHub,
    ...(secret === undefined ? {} : { secret }),
  });
  return { ...job, writes };
}

verifies("paperclip.pr-watcher-plugin", () => {
  test("only logs what it would do while dry run isn't turned off", async () => {
    const { ctx, writes, logs } = setUp({ githubToken: token });
    await runWatcher(ctx, now);
    expect(writes).toEqual([]);
    expect(logs.map((log) => log.message)).toContainEqual(
      expect.stringContaining("HAL-4485: done (dry run)"),
    );
  });

  test("marks the task done once dry run is turned off", async () => {
    const { ctx, writes } = setUp({ githubToken: token, dryRun: false });
    await runWatcher(ctx, now);
    expect(writes.map((write) => write.kind)).toEqual(["update", "comment"]);
    expect(writes[0]).toEqual({ kind: "update", issueId: "task-4485", patch: { status: "done" } });
  });

  test("skips a company without a GitHub token and reads no secret", async () => {
    const { ctx, resolved, sent, logs } = setUp({ dryRun: false });
    await runWatcher(ctx, now);
    expect(resolved).toEqual([]);
    expect(sent).toEqual([]);
    expect(logs[0]?.message).toContain("no GitHub token");
  });

  test("skips a company the host refuses because it has no saved settings", async () => {
    // The scheduled run of 22 Nov 10:00 UTC failed on this refusal.
    const { ctx, writes, logs } = setUp({ githubToken: token, dryRun: false }, undefined, [
      "globex",
    ]);
    await runWatcher(ctx, now);
    expect(logs[0]).toEqual({
      level: "info",
      message: "PR watcher: no settings saved for this company, skipped.",
      meta: { companyId: "globex" },
    });
    expect(writes[0]).toEqual({ kind: "update", issueId: "task-4485", patch: { status: "done" } });
  });

  test("names itself in a User-Agent on every GitHub request", async () => {
    // GitHub answered 403 to the trial install of 22 Nov: the host adds no User-Agent.
    const { ctx, sent } = setUp({ githubToken: token, dryRun: false });
    await runWatcher(ctx, now);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((request) => request.userAgent === "halonic-agent-tools")).toBe(true);
  });
});

verifies("paperclip.pr-watcher-read-only", () => {
  test("sends the token only with GET requests and GraphQL queries to api.github.com, and never logs it", async () => {
    const { ctx, sent, logs, signals } = setUp({ githubToken: token, dryRun: false });
    await runWatcher(ctx, now);
    expect(sent.map((request) => request.method)).toContain("POST");
    for (const request of sent) {
      const url = new URL(request.url);
      expect(url.origin).toBe("https://api.github.com");
      expect(request.method === "GET" || url.pathname === "/graphql").toBe(true);
      expect(request.authorization).toBe("Bearer test-token");
    }
    expect(JSON.stringify(logs)).not.toContain("test-token");
    // Every request carries a time limit, so a stuck GitHub can't hold the worker.
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });
});

verifies("paperclip.github-snapshot-store", () => {
  test("saves each pass's snapshot for the company, and readers load it back", async () => {
    const { ctx } = setUp({ githubToken: token });
    await runWatcher(ctx, now);
    const snapshot = await loadSnapshot(ctx, "acme");
    expect(snapshot?.takenAt).toBe(now.toISOString());
    expect(snapshot?.repos[0]?.pulls.map((pull) => [pull.number, pull.state])).toEqual([
      [4485, "merged"],
    ]);
    expect(await loadSnapshot(ctx, "globex")).toBeUndefined();
  });

  test("refuses a stored snapshot of another version", async () => {
    const { ctx } = setUp({ githubToken: token });
    await runWatcher(ctx, now);
    const stored = (await loadSnapshot(ctx, "acme")) ?? {};
    await saveSnapshot(ctx, "acme", { ...stored, version: 2 } as unknown as Snapshot);
    await expect(loadSnapshot(ctx, "acme")).rejects.toThrow(
      "GitHub snapshot: stored version 2, this code reads 1.",
    );
  });

  test("still decides when the snapshot can't be saved, and logs why", async () => {
    const { ctx, writes, logs } = setUp({ githubToken: token, dryRun: false });
    const failing = {
      ...ctx,
      state: { ...ctx.state, set: () => Promise.reject(new Error("state store is down")) },
    };
    await runWatcher(failing, now);
    expect(writes[0]).toEqual({ kind: "update", issueId: "task-4485", patch: { status: "done" } });
    expect(logs).toContainEqual({
      level: "error",
      message: "PR watcher: couldn't save the GitHub snapshot: state store is down",
      meta: { companyId: "acme" },
    });
  });
});

describe("the job", () => {
  test("names GitHub's reason when it refuses a request", async () => {
    const message = "Request forbidden by administrative rules.";
    const get = gitHubReader({
      fetch: async () => new Response(JSON.stringify({ message }), { status: 403 }),
    });
    await expect(get("/repos/halonic-com/halonic/pulls")).rejects.toThrow(
      `GitHub: GET /repos/halonic-com/halonic/pulls answered 403: ${message}.`,
    );
    const bare = gitHubReader({ fetch: async () => new Response("oops", { status: 502 }) });
    await expect(bare("/rate_limit")).rejects.toThrow("GitHub: GET /rate_limit answered 502.");
  });

  test("logs a company that fails, and fails at the end", async () => {
    const { ctx, logs } = setUp({ githubToken: token }, () =>
      Promise.reject(new Error("secret not found")),
    );
    await expect(runWatcher(ctx, now)).rejects.toThrow("couldn't be checked");
    expect(logs).toContainEqual({
      level: "error",
      message: "PR watcher: couldn't run: secret not found",
      meta: { companyId: "acme" },
    });
  });

  test("reads settings with safe defaults", () => {
    expect(readSettings({})).toEqual({
      token: undefined,
      repos: ["halonic-com/halonic", "halonic-com/cloud"],
      dryRun: true,
      fastTrackUnblocks: new Set(),
      fastTrackLabelAdder: "",
      watchers: {
        dryRun: true,
        wakeTasks: { Liam: "", Julian: "", Nora: "" },
        unhandledTask: "",
        boardLineTask: "",
        handQueueBranches: [],
      },
      fastTrackSharedLabelScope: {
        parents: ["HAL-17422"],
        pulls: ["halonic-com/halonic#5659", "halonic-com/halonic#5674"],
      },
      stackRebase: { enabled: false, token: undefined },
    });
    expect(readSettings({ fastTrackLabelAdder: " board-member " }).fastTrackLabelAdder).toBe(
      "board-member",
    );
    expect(readSettings({ fastTrackLabelAdder: 7 }).fastTrackLabelAdder).toBe("");
    expect([
      ...readSettings({ fastTrackUnblocks: [5101, 0, "5102", 1.5] }).fastTrackUnblocks,
    ]).toEqual([5101]);
    expect(readSettings({ dryRun: "no", githubToken: "secret-pr-watcher" }).dryRun).toBe(true);
    expect(readSettings({ githubToken: "secret-pr-watcher" }).token).toBeUndefined();
    expect(readSettings({ repos: ["acme/tools", "../evil", 7] }).repos).toEqual(["acme/tools"]);
    expect(readSettings({ githubToken: { ...token, version: 2 } }).token).toEqual({
      ...token,
      version: 2,
    });
  });
});
