import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { CopyComment } from "./approval-copy.ts";
import {
  ciOk,
  fakeGitHub,
  head,
  issues,
  ours,
  page,
  pr12,
  pull,
  pulls,
  run,
} from "./pulls.test-helper.ts";

/** Julian's copy of his approval of `head`, as his own agent writes it on the task. */
const julianCopy: CopyComment = {
  authorAgentId: "agent-julian",
  body: `Reviewed.\nJulian: approved on head \`${head}\``,
};

/** `#12` on `branch`, with Julian's approval of the head on GitHub. */
function approvedByJulian(branch: string, repo = ours) {
  return fakeGitHub(
    pr12(["Julian: approved on head `7651f8c`"], { head: { sha: head, ref: branch, repo } }),
  );
}

verifies("runtime.github-approval-copy", () => {
  describe("github.pull-request", () => {
    test("says copy: yes when the reviewer's own agent wrote the approval with the full head on the branch's task", async () => {
      const result = await run(
        "github.pull-request",
        { pr: 12 },
        approvedByJulian("priya/ACME-7-checkout").get,
        undefined,
        { tasks: { "ACME-7": [julianCopy] } },
      );
      expect(result.content).toContain("approvals: Julian on 7651f8c (copy: yes)");
      expect(result.data).toMatchObject({
        approvedOnHead: true,
        approvals: [{ by: "Julian", head: "7651f8c", counts: true, copy: "yes" }],
      });
    });

    test("says copy: no for a line another agent wrote, a short head or another head, and the approval still counts", async () => {
      const otherHead = `0${head.slice(1)}`;
      const notCopies: CopyComment[] = [
        { authorAgentId: "agent-mateo", body: julianCopy.body },
        { authorAgentId: "agent-julian", body: "Julian: approved on head `7651f8c`" },
        { authorAgentId: "agent-julian", body: `Julian: approved on head \`${otherHead}\`` },
        { authorAgentId: null, body: julianCopy.body },
      ];
      const result = await run(
        "github.pull-request",
        { pr: 12 },
        approvedByJulian("priya/ACME-7-checkout").get,
        undefined,
        { tasks: { "ACME-7": notCopies } },
      );
      expect(result.content).toContain("approvals: Julian on 7651f8c (copy: no)");
      expect(result.data).toMatchObject({
        approvedOnHead: true,
        approvals: [{ counts: true, copy: "no" }],
      });
    });

    test("says copy: no when no agent's url key is the reviewer's name in lower case", async () => {
      // Liam's url key is `liam-cto`, so no agent can hold his copy.
      const github = fakeGitHub(pr12(["Liam: approved on head `7651f8c`"]));
      const liamCopy = { authorAgentId: "agent-liam", body: `Liam: approved on head \`${head}\`` };
      const result = await run("github.pull-request", { pr: 12 }, github.get, undefined, {
        tasks: { "ACME-7": [liamCopy] },
      });
      expect(result.content).toContain("approvals: Liam on 7651f8c (copy: no)");
    });

    test("says copy: unknown when the branch names no task, Paperclip has no such task, or it is a fork's", async () => {
      const tasks = { "ACME-7": [julianCopy] };
      const branches = [
        approvedByJulian("priya/fix-typo"),
        approvedByJulian("priya/ACME-8-other"),
        approvedByJulian("priya/ACME-7-checkout", { full_name: "someone/website" }),
      ];
      for (const github of branches) {
        const result = await run("github.pull-request", { pr: 12 }, github.get, undefined, {
          tasks,
        });
        expect(result.content).toContain("approvals: Julian on 7651f8c (copy: unknown)");
      }
    });
  });

  describe("github.open-pull-requests", () => {
    test("shows each approval on the head with its copy: yes, no or unknown", async () => {
      const mine = (number: number, ref: string) => ({
        listed: { number, head: { ref, repo: ours } },
        pull: pull(number, { title: `pr ${number}`, head: { sha: head, ref, repo: ours } }),
      });
      const cart = mine(21, "mateo/ACME-3-cart");
      const cleanup = mine(24, "mateo/cleanup");
      const approvals = [
        { body: "Julian: approved on head `7651f8c`", author_association: "MEMBER" },
        { body: "Priya: approved on head `7651f8c`", author_association: "MEMBER" },
      ];
      const github = fakeGitHub({
        [`${pulls}?state=open&${page}`]: [cart.listed, cleanup.listed],
        [`${pulls}/21`]: cart.pull,
        [`${pulls}/24`]: cleanup.pull,
        ...ciOk("success"),
        [`${issues}/21/comments?${page}`]: approvals,
        [`${issues}/24/comments?${page}`]: approvals.slice(0, 1),
      });
      const result = await run("github.open-pull-requests", {}, github.get, undefined, {
        tasks: { "ACME-3": [julianCopy] },
      });
      expect(result.content?.split("\n").slice(1, 3)).toEqual([
        '#21 (ACME-3): ready, ci-ok success, mergeable yes, approved on head (Julian copy: yes, Priya copy: no); title "pr 21"',
        '#24 (no task): ready, ci-ok success, mergeable yes, approved on head (Julian copy: unknown); title "pr 24"',
      ]);
      expect(result.data).toMatchObject([
        { number: 21, approvedOnHead: true },
        { number: 24, approvedOnHead: true },
      ]);
    });
  });
});
