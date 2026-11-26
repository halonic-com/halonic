import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { GitHubGet } from "../pr-watcher/github.ts";
import type { RecordedSource } from "../verdicts/gate.ts";
import type { VerdictRecord } from "../verdicts/record.ts";
import { type PrStatus, statusText } from "./pr-status.ts";
import { withVerdictGate } from "./pr-status-verdicts.ts";

const repo = "halonic-com/halonic";
const head = "c".repeat(40);

/** #7 on Mateo's branch, approved by Liam's line on GitHub (the comments' reading). */
const status: PrStatus = {
  repo,
  number: 7,
  url: `https://github.com/${repo}/pull/7`,
  state: "open",
  draft: false,
  branch: "mateo/HAL-1-thing",
  base: "main",
  author: "mateo",
  task: "HAL-1",
  head,
  ciOk: "success",
  mergeable: "yes",
  behindBase: 0,
  inQueue: false,
  approvals: [{ by: "Liam", head: head.slice(0, 7), counts: true }],
  approvedOnHead: true,
  reviewer: "Liam",
  changedLines: 10,
  securityFile: undefined,
  latestReviewFinding: undefined,
  requiredWorkflows: [],
};

/** GitHub's answers about #7: two changed files of `changedFiles`. */
function gitHub(changedFiles = 2): GitHubGet {
  return async (path) => {
    if (path === `/repos/${repo}/pulls/7`) {
      return {
        html_url: status.url,
        title: "thing",
        state: "open",
        merged_at: null,
        mergeable: true,
        changed_files: changedFiles,
        head: { sha: head, ref: status.branch, repo: { full_name: repo } },
        base: { ref: "main" },
        user: { login: "halonic-dev" },
      };
    }
    if (path.startsWith(`/repos/${repo}/pulls/7/files`)) {
      return [
        { filename: "apps/studio/src/a.ts", status: "modified", additions: 4, deletions: 1 },
        { filename: "apps/studio/src/b.ts", status: "modified", additions: 4, deletions: 1 },
      ];
    }
    if (path.startsWith(`/repos/${repo}/compare/`)) {
      return { merge_base_commit: { sha: "d".repeat(40) }, files: [] };
    }
    throw new Error(`unexpected GitHub read ${path}`);
  };
}

function liamRecord(): VerdictRecord {
  return {
    id: "record-1",
    repo,
    pr: 7,
    head,
    fingerprint: null,
    verdict: "approved",
    reviewer: "liam",
    agentId: "agent-liam",
    runId: "run-1",
    task: "HAL-1",
    at: "2026-11-26T10:00:00.000Z",
  };
}

function source(records: readonly VerdictRecord[]): RecordedSource {
  return {
    store: {
      list: async () => [...records],
      append: async () => {
        throw new Error("pr_status never writes");
      },
    },
    teamLogin: "halonic-dev",
    taskComments: async (identifier) =>
      identifier === "HAL-1"
        ? [{ authorAgentId: "agent-mateo", origin: "comment", body: "Ready: halonic#7." }]
        : [],
    agents: async () => [
      { id: "agent-mateo", urlKey: "mateo" },
      { id: "agent-liam", urlKey: "liam" },
    ],
  };
}

verifies("paperclip.verdicts-gate", () => {
  describe("pr_status and the board's flag", () => {
    test("flag off: the approvals from comments are unchanged, and it says the flag is off", async () => {
      const read = await withVerdictGate(gitHub(), status, undefined);
      expect(read).toEqual({ ...status, verdictGate: "off" });
      expect(statusText(read)).toContain(
        "approvals read from: PR comments (the board's verdict flag is off)",
      );
    });

    test("flag on: Liam's line on GitHub alone doesn't count", async () => {
      const read = await withVerdictGate(gitHub(), status, source([]));
      expect(read).toMatchObject({ approvals: [], approvedOnHead: false, verdictGate: "on" });
      expect(statusText(read)).toContain(
        "approvals read from: recorded verdicts only (the board's verdict flag is on); not approved: no recorded approval",
      );
    });

    test("flag on: Liam's recorded approval approves the head", async () => {
      const read = await withVerdictGate(gitHub(), status, source([liamRecord()]));
      expect(read).toMatchObject({ approvedOnHead: true, verdictGate: "on" });
      expect(read.approvals).toEqual([expect.objectContaining({ by: "Liam", counts: true })]);
      expect(read.verdictWhy).toBeUndefined();
    });

    test("flag on: a files list GitHub cut short is not approved", async () => {
      const read = await withVerdictGate(gitHub(3), status, source([liamRecord()]));
      expect(read).toMatchObject({ approvedOnHead: false });
      expect(read.verdictWhy).toBe(
        "only 2 of its 3 changed files were read: the review rules can't be checked",
      );
    });

    test("flag on: a GitHub read that fails is not approved", async () => {
      const failing: GitHubGet = async () => {
        throw new Error("GitHub is down.");
      };
      const read = await withVerdictGate(failing, status, source([liamRecord()]));
      expect(read).toMatchObject({ approvedOnHead: false, approvals: [] });
      expect(read.verdictWhy).toBe("the pull request couldn't be read: GitHub is down.");
    });
  });
});
