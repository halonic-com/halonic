import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { conflictFilesText, gitHubConflictFiles } from "./conflict-files.ts";
import {
  agents,
  fakeGitHub,
  fakePaperclip,
  recording,
  restFacts,
  task,
} from "./fakes.test-helper.ts";
import { tick } from "./watch.ts";

/**
 * A conflict wake names the files both sides changed (HAL-17922), so the
 * woken author knows where the rebase will stop before reading anything.
 */

const head = "7dd0ccfe36faa740c9a9a74e548adfff5f3ee761";
const compare = "/repos/halonic-com/halonic/compare";

/** #4614 changed README.md and src/worker.ts; main changed src/worker.ts and docs/x.md since. */
const bothChanged = {
  [`${compare}/main...${head}`]: {
    files: [{ filename: "README.md" }, { filename: "src/worker.ts" }],
  },
  [`${compare}/${head}...main`]: {
    files: [{ filename: "src/worker.ts" }, { filename: "docs/x.md" }],
  },
};

function run(github: ReturnType<typeof fakeGitHub>, paperclip: ReturnType<typeof fakePaperclip>) {
  const lines: string[] = [];
  const summary = tick({
    paperclip: paperclip.paperclip,
    facts: restFacts(github.get),
    discover: paperclip.discover,
    dryRun: false,
    log: (line) => lines.push(line),
    now: new Date("2026-11-21T22:00:00Z"),
    conflictFiles: gitHubConflictFiles(github.get),
  });
  return { summary, lines };
}

verifies("paperclip.pr-watcher-conflict-files", () => {
  test("names the files both sides changed in one wake, and a second pass adds nothing", async () => {
    const github = fakeGitHub(recording("red-and-conflicting"), bothChanged);
    const paperclip = fakePaperclip([task(4614, agents.mateo)]);
    expect((await run(github, paperclip).summary).woken).toBe(1);
    expect((await run(github, paperclip).summary).woken).toBe(0);
    const comments = paperclip.comments["task-4614"] ?? [];
    expect(comments).toHaveLength(1);
    const conflictLine = comments[0]?.body.split("\n").find((line) => line.includes("conflicts"));
    expect(conflictLine).toBe(
      "- [#4614](https://github.com/halonic-com/halonic/pull/4614): it conflicts with its base branch and isn't in the merge queue. Files it and its base both changed since it branched: `src/worker.ts`.",
    );
    expect(github.calls.every((call) => call.method === "GET")).toBe(true);
    expect(github.calls.filter((call) => call.url.includes("/compare/"))).toHaveLength(2);
  });

  test("still wakes the author, without files, when GitHub refuses the list", async () => {
    const github = fakeGitHub(recording("red-and-conflicting"));
    const paperclip = fakePaperclip([task(4614, agents.mateo)]);
    const { summary, lines } = run(github, paperclip);
    expect((await summary).woken).toBe(1);
    const body = paperclip.comments["task-4614"]?.[0]?.body ?? "";
    expect(body).toContain("conflicts with its base branch and isn't in the merge queue.\n");
    expect(body).not.toContain("Files it and its base");
    expect(lines.some((line) => line.includes("couldn't list its conflicting files"))).toBe(true);
  });

  test("names at most 10 files and counts the rest", () => {
    const files = Array.from({ length: 12 }, (_, index) => `f${String(index).padStart(2, "0")}`);
    const text = conflictFilesText(files);
    expect(text).toContain("`f00`");
    expect(text.endsWith("`f09` and 2 more.")).toBe(true);
    expect(text).not.toContain("`f10`");
    expect(conflictFilesText([])).toBe("");
  });
});
