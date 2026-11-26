import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { fakeGitHub, recording } from "../pr-watcher/fakes.test-helper.ts";
import { prStatus, statusText } from "./pr-status.ts";
import { requiredAnswers } from "./required-workflows.test-helper.ts";

const repo = "halonic-com/halonic";
const head = "7651f8c1e4af38752f56d353156c5dd19ff54984";
const pulls = `/repos/${repo}/pulls`;
const issues = `/repos/${repo}/issues`;
const manifest = "tooling/paperclip/src/plugin/manifest.ts";

/** #4588 from the recording, on Mateo's branch, with these comments and changed files. */
function pull(comments: readonly string[], files: readonly string[]) {
  const recorded = recording("review-finding");
  return fakeGitHub(recorded, requiredAnswers(repo, 4588, head), {
    [`${pulls}/4588`]: {
      ...(recorded[`${pulls}/4588`] as object),
      head: { sha: head, ref: "mateo/HAL-1-plugin", repo: { full_name: repo } },
      additions: 40,
      deletions: 10,
    },
    [`${issues}/4588/comments?per_page=100&page=1`]: comments.map((body, id) => ({
      id,
      created_at: "2026-11-26T08:00:00Z",
      body,
      author_association: "MEMBER",
    })),
    [`${pulls}/4588/files?per_page=100&page=1`]: files.map((filename) => ({ filename })),
    [`${issues}/4588/timeline?per_page=100&page=1`]: [],
    [`/repos/${repo}/compare/main...${head}`]: { behind_by: 0 },
  });
}

verifies("paperclip.manifest-julian", () => {
  test("pr_status counts Liam's approval of a plugin manifest change only with Julian's on the head too", async () => {
    const liam = "Liam: approved on head `7651f8c`";
    const alone = await prStatus(pull([liam], [manifest]).get, repo, 4588);
    expect(alone).toMatchObject({ manifestFile: manifest, approvedOnHead: false });
    expect(statusText(alone)).toContain(
      `and Julian too: it changes a plugin manifest (${manifest})`,
    );
    const both = await prStatus(
      pull([liam, "Julian: approved on head `7651f8c`"], [manifest]).get,
      repo,
      4588,
    );
    expect(both.approvedOnHead).toBe(true);
  });

  test("pr_status doesn't count Julian's approval of an older head for the manifest", async () => {
    const comments = ["Liam: approved on head `7651f8c`", "Julian: approved on head `0000000`"];
    const status = await prStatus(pull(comments, [manifest]).get, repo, 4588);
    expect(status.approvedOnHead).toBe(false);
  });

  test("pr_status asks nothing more of a pull request that changes no manifest", async () => {
    const files = ["tooling/paperclip/src/plugin/worker.ts"];
    const status = await prStatus(
      pull(["Liam: approved on head `7651f8c`"], files).get,
      repo,
      4588,
    );
    expect(status.manifestFile).toBeUndefined();
    expect(status.approvedOnHead).toBe(true);
  });
});

verifies("paperclip.manifest-closure", () => {
  test("pr_status asks only for Julian's approval when the reviewer's already counts", async () => {
    const status = await prStatus(
      pull(["Liam: approved on head `7651f8c`"], [manifest]).get,
      repo,
      4588,
    );
    const next = statusText(status).split("\n").at(-1);
    expect(next).toBe(
      `next: get Julian's approval on this head: it changes a plugin manifest (${manifest})`,
    );
  });
});
