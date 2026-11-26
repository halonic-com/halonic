import type { Tool } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost, githubToken } from "../fake-host.test-helper.ts";
import type { GitHubGet } from "../github.ts";
import { type ActionCall, runtimeHandlers } from "../handlers.ts";
import { registerWorkspaceTools } from "../register.ts";
import { duration, pageLimit } from "./merge-times.ts";

/** The invented `acme` repositories and the time the tests run at. */
const repo = "acme/website";
const other = "acme/private-tools";
const now = new Date("2026-11-24T12:00:00Z");

/** The closed pull request list's path, page by page. */
const closed = (name: string, page = 1) =>
  `/repos/${name}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`;

/** One closed pull request as GitHub's list gives it; merged when `merged` is a time. */
function pull(number: number, created: string, merged: string | null, base = "main") {
  return {
    number,
    created_at: created,
    updated_at: merged ?? created,
    merged_at: merged,
    base: { ref: base, repo: { default_branch: "main" } },
  };
}

/**
 * The last week on `acme/website`: three merges into `main` (90 minutes,
 * a day and 30 minutes from opened to merged), one closed without merging,
 * one merged into a stacked branch, and one merged before the week began.
 */
const lastWeek = [
  pull(40, "2026-11-24T08:30:00Z", "2026-11-24T10:00:00Z"),
  pull(39, "2026-11-23T09:00:00Z", null),
  pull(38, "2026-11-22T12:00:00Z", "2026-11-23T12:00:00Z"),
  pull(37, "2026-11-22T08:00:00Z", "2026-11-22T09:00:00Z", "priya/ACME-6-base"),
  pull(36, "2026-11-20T11:30:00Z", "2026-11-20T12:00:00Z"),
  pull(20, "2026-11-09T12:00:00Z", "2026-11-10T12:00:00Z"),
];

const lastWeekText = [
  "Merge times, last 7 days, measured opened to merged: from when a pull request was opened to when it merged, not its time in the merge queue.",
  "acme/website: 3 merged into the default branch (0.4 per day).",
  "- Opened to merged: median 1 h 30 min, longest 1 d 0 h.",
];

/** `merge_speed` reading the listed repositories over `days`. */
function mergeSpeedTool(repositories: string[] = [repo], days = 7): Tool {
  return acmeTool("merge_speed", {
    action: { run: "github.merge-times", with: { repositories, days } },
  } as Partial<Tool>);
}

/** A GitHub reader answering from `answers`; any other path answers 404, as GitHub would. */
function fakeGitHub(answers: Record<string, unknown>) {
  const paths: string[] = [];
  const get: GitHubGet = async (path) => {
    paths.push(path);
    if (!(path in answers)) {
      throw new Error(`GitHub: GET ${path.split("?")[0]} answered 404.`);
    }
    return answers[path];
  };
  return { get, paths };
}

/** Runs `github.merge-times` through the runtime's handlers, as Mateo would call it. */
function run(tool: Tool, get: GitHubGet) {
  const handler = runtimeHandlers["github.merge-times"];
  if (handler === undefined) throw new Error("no handler for github.merge-times");
  return handler.run({
    tool,
    params: {},
    templates: [],
    caller: { agentId: "agent-mateo", urlKey: "mateo", name: "Mateo" },
    workspaceCommit: "0123456789abcdef0123456789abcdef01234567",
    now,
    companyId: "acme",
    paperclip: {} as ActionCall["paperclip"],
    github: async () => get,
    githubQuery: async () => {
      throw new Error("github.merge-times reads GitHub's REST API only");
    },
  });
}

verifies("runtime.github-merge-times", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("github.merge-times", () => {
    test("answers opened-to-merged times through a plugin host, named as such", async () => {
      const snapshot = acmeSnapshot({ tools: [mergeSpeedTool()] });
      const host = fakeHost({ githubToken }, { [closed(repo)]: lastWeek });
      registerWorkspaceTools(host.ctx, {
        declarations: [
          {
            name: "merge_speed",
            displayName: "merge_speed",
            description: "Acme's merge_speed.",
            parametersSchema: { type: "object", properties: {} },
          },
        ],
        builtIn: snapshot,
        handlers: runtimeHandlers,
      });
      const result = await host.call("merge_speed", {});
      expect(result.content?.split("\n")).toEqual(lastWeekText);
      expect(host.sent).toEqual([`https://api.github.com${closed(repo)}`]);
    });

    test("gives numbers and times only, and stops reading once the list passes the window", async () => {
      const github = fakeGitHub({ [closed(repo)]: lastWeek });
      const result = await run(mergeSpeedTool(), github.get);
      expect(result.data).toEqual({
        measure: "opened to merged",
        days: 7,
        since: "2026-11-17T12:00:00.000Z",
        repos: [
          {
            repo,
            merged: [
              { number: 40, mergedAt: "2026-11-24T10:00:00Z", minutesOpenToMerged: 90 },
              { number: 38, mergedAt: "2026-11-23T12:00:00Z", minutesOpenToMerged: 1440 },
              { number: 36, mergedAt: "2026-11-20T12:00:00Z", minutesOpenToMerged: 30 },
            ],
            medianMinutes: 90,
            longestMinutes: 1440,
            cutShort: false,
          },
        ],
        unread: [],
      });
      expect(github.paths).toEqual([closed(repo)]);
    });

    test("counts only the tool's days, a merge right at the start included", async () => {
      const github = fakeGitHub({ [closed(repo)]: lastWeek });
      const result = await run(mergeSpeedTool([repo], 1), github.get);
      expect(result.content?.split("\n").slice(1)).toEqual([
        "acme/website: 2 merged into the default branch (2 per day).",
        "- Opened to merged: median 12 h 45 min, longest 1 d 0 h.",
      ]);
    });

    test("says so when nothing merged", async () => {
      const github = fakeGitHub({ [closed(repo)]: [pull(39, "2026-11-23T09:00:00Z", null)] });
      const result = await run(mergeSpeedTool(), github.get);
      expect(result.content?.split("\n")[1]).toBe(
        "acme/website: 0 merged into the default branch (0 per day).",
      );
    });

    test(`reads at most ${pageLimit} pages and says older merges are missing`, async () => {
      const busy = Array.from({ length: 100 }, (_, index) =>
        pull(1000 + index, "2026-11-24T09:00:00Z", "2026-11-24T11:00:00Z"),
      );
      const pages = Object.fromEntries(
        Array.from({ length: pageLimit + 1 }, (_, index) => [closed(repo, index + 1), busy]),
      );
      const github = fakeGitHub(pages);
      const result = await run(mergeSpeedTool(), github.get);
      expect(github.paths).toHaveLength(pageLimit);
      expect(result.content).toContain(
        "- Only the 1000 most recently updated closed pull requests were read; older merges in the window are missing.",
      );
    });

    test("names a later repository the token doesn't reach, and fails on the first", async () => {
      const github = fakeGitHub({ [closed(repo)]: lastWeek });
      const result = await run(mergeSpeedTool([repo, other]), github.get);
      expect(result.content?.split("\n").at(-1)).toBe(
        `Not read: ${other}, the token doesn't reach it.`,
      );
      await expect(run(mergeSpeedTool([other, repo]), github.get)).rejects.toThrow("answered 404");
    });

    test("refuses a tool that names another action, before asking GitHub", async () => {
      const github = fakeGitHub({});
      expect(await run(acmeTool("pr_status"), github.get)).toEqual({
        error: "pr_status: runs github.pull-request, not github.merge-times.",
      });
      expect(github.paths).toEqual([]);
    });

    test("writes durations in minutes, hours and days", () => {
      expect([45, 185, 3121].map(duration)).toEqual(["45 min", "3 h 5 min", "2 d 4 h"]);
    });
  });
});
