import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { recording } from "../pr-watcher/fakes.test-helper.ts";
import { gitHubReader } from "../pr-watcher/github.ts";
import { type FakeIssue, fakeHost, fakeJobContext } from "./fake-host.test-helper.ts";
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

/** GitHub's lists: #4485 closed yesterday on Priya's branch for HAL-4485. */
const lists = {
  "/repos/halonic-com/halonic/pulls?state=open&per_page=100&page=1": [],
  "/repos/halonic-com/halonic/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1": [
    {
      number: 4485,
      updated_at: "2026-11-21T20:00:00Z",
      head: { ref: "priya/HAL-4485-month-spend", repo: { full_name: "halonic-com/halonic" } },
    },
  ],
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
    answers: { ...lists, ...recording("merged-green") },
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
  test("sends the token only with GET requests to api.github.com, and never logs it", async () => {
    const { ctx, sent, logs, signals } = setUp({ githubToken: token, dryRun: false });
    await runWatcher(ctx, now);
    expect(sent.length).toBeGreaterThan(2);
    for (const request of sent) {
      expect(request.method).toBe("GET");
      expect(new URL(request.url).origin).toBe("https://api.github.com");
      expect(request.authorization).toBe("Bearer test-token");
    }
    expect(JSON.stringify(logs)).not.toContain("test-token");
    // Every request carries a time limit, so a stuck GitHub can't hold the worker.
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
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
      repos: ["halonic-com/halonic"],
      dryRun: true,
    });
    expect(readSettings({ dryRun: "no", githubToken: "secret-pr-watcher" }).dryRun).toBe(true);
    expect(readSettings({ githubToken: "secret-pr-watcher" }).token).toBeUndefined();
    expect(readSettings({ repos: ["acme/tools", "../evil", 7] }).repos).toEqual(["acme/tools"]);
    expect(readSettings({ githubToken: { ...token, version: 2 } }).token).toEqual({
      ...token,
      version: 2,
    });
  });
});
