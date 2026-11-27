import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { CloseGuards } from "./close-guards.ts";
import {
  agentComment,
  agents,
  type FakeTask,
  fakeGitHub,
  fakePaperclip,
  recording,
  restFacts,
  task,
} from "./fakes.test-helper.ts";
import type { CommentRow } from "./paperclip.ts";
import { tick } from "./watch.ts";

/**
 * The guards on done (HAL-18284). Pull request 4485 merged green at 20:48 on
 * 21 Nov (the `merged-green` recording); the checks run about an hour later
 * unless a case says otherwise.
 */

const soon = new Date("2026-11-21T22:00:00Z");

async function run(
  listed: FakeTask,
  options: {
    readonly comments?: CommentRow[];
    readonly now?: Date;
    readonly boardCard?: boolean;
  } = {},
) {
  const paperclip = fakePaperclip([listed], { [listed.id]: options.comments ?? [] });
  const github = fakeGitHub(recording("merged-green"));
  const lines: string[] = [];
  const closeGuards: CloseGuards = {
    mergeWindowHours: 12,
    boardCard: async () => options.boardCard === true,
  };
  await tick({
    paperclip: paperclip.paperclip,
    facts: restFacts(github.get),
    discover: paperclip.discover,
    dryRun: false,
    log: (line) => lines.push(line),
    now: options.now ?? soon,
    closeGuards,
  });
  return { done: paperclip.done, wakes: paperclip.wakes, lines };
}

/** Four comments by the author before the merge, oldest first; `texts[0]` is the 4th-newest. */
function comments(texts: readonly string[]): CommentRow[] {
  return texts.map((text, index) =>
    agentComment(agents.priya, `2026-11-21T20:0${index}:00.000Z`, text),
  );
}

verifies("paperclip.pr-watcher-close-guards", () => {
  test("leaves the task open when its pull request merged 13 hours ago", async () => {
    const result = await run(task(4485, agents.priya), {
      now: new Date("2026-11-22T09:50:00Z"),
    });
    expect(result.done).toEqual([]);
    expect(result.lines.join("\n")).toContain("its last merge is over 12 hours old");
  });

  test("leaves a task with an open board card open", async () => {
    const result = await run(task(4485, agents.priya), { boardCard: true });
    expect(result.done).toEqual([]);
    expect(result.lines.join("\n")).toContain("it has an open board card");
  });

  test("leaves the task open for 'PR 1 of 3' in its description", async () => {
    const result = await run(
      task(4485, agents.priya, { description: "Two parts. This is PR 1 of 3 for the importer." }),
    );
    expect(result.done).toEqual([]);
  });

  test("leaves the task open for 'stacked on' in the 2nd-newest comment", async () => {
    const texts = ["Plan noted.", "Started.", "Stacked on #5808, which merges first.", "Pushed."];
    const result = await run(task(4485, agents.priya), { comments: comments(texts) });
    expect(result.done).toEqual([]);
  });

  test("leaves the task open for 'more PRs' in the 3rd-newest comment", async () => {
    const texts = ["Plan noted.", "More PRs follow for the parser.", "Started.", "Pushed."];
    const result = await run(task(4485, agents.priya), { comments: comments(texts) });
    expect(result.done).toEqual([]);
  });

  test("closes the task when the text is only in the 4th-newest comment", async () => {
    const texts = ["more PRs follow, stacked on #5808", "Started.", "Rebased.", "Pushed."];
    const result = await run(task(4485, agents.priya), { comments: comments(texts) });
    expect(result.done).toEqual(["task-4485"]);
  });

  test("closes a task with none of these as before", async () => {
    const result = await run(task(4485, agents.priya, { description: "Fix the importer." }), {
      comments: comments(["Plan noted.", "Started.", "Rebased.", "Pushed."]),
    });
    expect(result.done).toEqual(["task-4485"]);
    expect(result.wakes).toEqual([]);
  });
});
