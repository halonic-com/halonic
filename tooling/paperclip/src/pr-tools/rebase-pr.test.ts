import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { fakeGitHub, recording } from "../pr-watcher/fakes.test-helper.ts";
import { prStatus } from "./pr-status.ts";
import { rebaseCheck, rebaseCheckText } from "./rebase-pr.ts";

const repo = "halonic-com/halonic";
const head = "7651f8c1e4af38752f56d353156c5dd19ff54984";
const pulls = `/repos/${repo}/pulls`;
const issues = `/repos/${repo}/issues`;

interface Pull4588 {
  readonly ref?: string;
  readonly base?: string;
  readonly files?: readonly string[];
  readonly mergeable?: boolean | null;
  readonly behind?: number;
  readonly queued?: boolean;
  readonly approvals?: readonly string[];
}

/** #4588 on Priya's branch for HAL-14219, behind `main` and mergeable unless told otherwise. */
function pr4588({
  ref = "priya/HAL-14219-engine-contract",
  base = "main",
  files = ["docs/guides/review.md"],
  mergeable = true,
  behind = 3,
  queued = false,
  approvals = ["Liam: approved on head `7651f8c`"],
}: Pull4588 = {}) {
  const recorded = recording("review-finding");
  return fakeGitHub(recorded, {
    [`${pulls}/4588`]: {
      ...(recorded[`${pulls}/4588`] as object),
      head: { sha: head, ref, repo: { full_name: repo } },
      base: { ref: base },
      title: "feat(engine): the engine contract",
      mergeable,
      additions: 120,
      deletions: 30,
    },
    [`${issues}/4588/comments?per_page=100&page=1`]: approvals.map((body, id) => ({
      id,
      body,
      author_association: "MEMBER",
      created_at: "2026-11-21T21:00:00Z",
    })),
    [`${pulls}/4588/files?per_page=100&page=1`]: files.map((filename) => ({ filename })),
    [`${issues}/4588/timeline?per_page=100&page=1`]: queued
      ? [{ event: "added_to_merge_queue" }]
      : [],
    [`/repos/${repo}/compare/${base}...${head}`]: {
      behind_by: behind,
      merge_base_commit: { sha: "0b1d2c3e4f5061728394a5b6c7d8e9f001122334" },
    },
  });
}

/** What `rebase_pr` answers `caller` about #4588 as `pull` describes it. */
async function check(caller: string, pull: Pull4588 = {}) {
  const github = pr4588(pull);
  const result = rebaseCheck(await prStatus(github.get, repo, 4588), caller);
  return { result, text: rebaseCheckText(result), calls: github.calls };
}

verifies("paperclip.rebase-pr", () => {
  describe("rebase_pr", () => {
    test("rebases the caller's own pull request behind main, and the approval carries over", async () => {
      const { result, text, calls } = await check("Priya");
      expect(result).toMatchObject({
        verdict: "rebase",
        reason: "3 commits behind main, with no conflict",
        approvals: ["Liam on 7651f8c"],
        carries: true,
      });
      expect(result.commands).toEqual([
        "git fetch origin main && git rebase origin/main",
        "git push --force-with-lease origin HEAD:priya/HAL-14219-engine-contract",
      ]);
      expect(text).toContain("rebase only when the queue session asked or it conflicts");
      expect(text).toContain("waits for the board's decision on the branch credential (HAL-18091)");
      expect(calls.every((call) => call.method === "GET")).toBe(true);
    });

    test("refuses another agent's pull request", async () => {
      const { result } = await check("mateo");
      expect(result.verdict).toBe("refused");
      expect(result.reason).toBe("it's priya's pull request, and the tool rebases only your own");
      expect(result.commands).toEqual([]);
    });

    test("refuses a queued, conflicting or not yet known pull request, with commands only for the conflict", async () => {
      const queued = await check("priya", { queued: true });
      expect(queued.result).toMatchObject({ verdict: "refused", commands: [] });
      expect(queued.result.reason).toContain("in the merge queue");

      const conflict = await check("priya", { mergeable: false });
      expect(conflict.result.verdict).toBe("refused");
      expect(conflict.result.reason).toContain("conflicts with its base");
      expect(conflict.result.commands).toHaveLength(2);

      const unknown = await check("priya", { mergeable: null });
      expect(unknown.result).toMatchObject({ verdict: "refused", commands: [] });
      expect(unknown.result.reason).toContain("ask again in a minute");
    });

    test("says a pull request level with main is up to date, with no commands", async () => {
      const { result, text } = await check("priya", { behind: 0 });
      expect(result).toMatchObject({
        verdict: "up-to-date",
        reason: "it's up to date with main",
        commands: [],
      });
      expect(text).not.toContain("approvals:");
    });

    test("doesn't carry the approval on a security pull request by its paths or Liam's own", async () => {
      const security = await check("priya", { files: ["packages/x/src/sandbox/fence.ts"] });
      expect(security.result).toMatchObject({ verdict: "rebase", carries: false });
      expect(security.result.carryNote).toBe(
        'a security pull request by its paths ("packages/x/src/sandbox/fence.ts"), so it needs a re-review',
      );

      const liams = await check("liam", {
        ref: "liam/HAL-14219-engine-contract",
        approvals: ["Julian: approved on head `7651f8c`"],
      });
      expect(liams.result).toMatchObject({ verdict: "rebase", carries: false });
      expect(liams.result.carryNote).toBe("Liam's own pull request, so it needs a re-review");
    });

    test("doesn't carry the approval on a stacked pull request whose base isn't main", async () => {
      const { result } = await check("priya", { base: "priya/HAL-14218-engine-types" });
      expect(result).toMatchObject({ verdict: "rebase", carries: false });
      expect(result.carryNote).toBe(
        "a stacked pull request on priya/HAL-14218-engine-types, whose approved diff isn't from main, so it needs a re-review",
      );
    });

    test("says there's nothing to carry without an approval on the head", async () => {
      const { result, text } = await check("priya", { approvals: [] });
      expect(result).toMatchObject({ verdict: "rebase", approvals: [], carries: false });
      expect(text).not.toContain("queue session asked");
    });

    test("gives no commands for a branch name that isn't plain", async () => {
      const { result, text } = await check("priya", { ref: "priya/HAL-14219-x;rm" });
      expect(result.verdict).toBe("rebase");
      expect(result.commands).toEqual([]);
      expect(text).toContain('branch "priya/HAL-14219-x;rm"');
    });
  });
});
