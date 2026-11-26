import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agents, fakePaperclip, task } from "./fakes.test-helper.ts";
import { head, open, repo } from "./handoff.test-helper.ts";
import { failedRequired } from "./required-workflows.ts";
import { tick } from "./watch.ts";

/**
 * #6247 failed `Guard notes` and #5953 failed `Built-on label` with `ci-ok`
 * green, and nobody heard (HAL-19031). #6183 was retargeted while its
 * reviewer held the task, which the watcher skipped.
 */

const noteJob = "Decision note and the guard's own paths";
const newHead = "6248cccccccccccccccccccccccccccccccccccc";

/** Watcher passes over `tasks`, each with the pull requests `pullsOf` gives for that pass. */
function passes(tasks: Parameters<typeof fakePaperclip>[0]) {
  const paperclip = fakePaperclip(tasks);
  const pass = (pulls: readonly PullFacts[]) =>
    tick({
      paperclip: paperclip.paperclip,
      discover: paperclip.discover,
      facts: async (refs) =>
        new Map(
          refs.flatMap((ref) =>
            pulls
              .filter((pull) => pull.number === ref.number)
              .map((pull) => [`${repo}#${ref.number}`, { ...pull, branch: ref.branch }] as const),
          ),
        ),
      dryRun: false,
      log: () => undefined,
      now: new Date("2026-11-26T01:00:00Z"),
    });
  const watcherComments = (taskId: string) =>
    (paperclip.comments[taskId] ?? []).filter((comment) => comment.authorAgentId === null);
  return { ...paperclip, pass, watcherComments };
}

const guardFailed = { workflow: "Guard notes", job: noteJob };

verifies("paperclip.pr-watcher-required-failed", () => {
  test("reads a failed required workflow from the head's failing checks by its job", () => {
    expect(failedRequired(["Fast gates", "built-on-label", noteJob])).toEqual([
      guardFailed,
      { workflow: "Built-on label", job: "built-on-label" },
    ]);
    expect(failedRequired(["Fast gates"])).toEqual([]);
  });

  test("wakes the author once per head for a failed Guard notes, naming the job, with ci-ok green (#6247)", async () => {
    const watcher = passes([task(6247, agents.mateo)]);
    const failed = open(6247, "", { failedRequired: [guardFailed] });
    const first = await watcher.pass([failed]);
    const second = await watcher.pass([failed]);
    expect([first.woken, second.woken]).toEqual([1, 0]);
    expect(watcher.wakes).toEqual([
      { taskId: "task-6247", key: `${repo}#6247 ${head.slice(0, 7)} Guard notes failed` },
    ]);
    const [comment] = watcher.watcherComments("task-6247");
    expect(comment?.body).toContain(`the required workflow \`Guard notes\` failed`);
    expect(comment?.body).toContain(`(job \`${noteJob}\`)`);
    expect(comment?.body).toContain("even with `ci-ok` green");
    const pushed = { ...failed, head: newHead };
    expect((await watcher.pass([pushed])).woken).toBe(1);
  });

  test("wakes the author for a failed Built-on label too, and not for a draft (#5953)", async () => {
    const builtOn = { workflow: "Built-on label", job: "built-on-label" };
    const watcher = passes([task(5953, agents.priya), task(5954, agents.priya)]);
    const outcome = await watcher.pass([
      open(5953, "", { failedRequired: [builtOn] }),
      open(5954, "", { failedRequired: [builtOn], draft: true }),
    ]);
    expect(outcome.woken).toBe(1);
    expect(watcher.wakes.map((wake) => wake.key)).toEqual([
      `${repo}#5953 ${head.slice(0, 7)} Built-on label failed`,
    ]);
    expect(watcher.watcherComments("task-5953")[0]?.body).toContain("`built-on:paperclip` label");
  });

  test("wakes the reviewer who holds the task once per head, but not on a parked task", async () => {
    const held = task(6250, agents.liam, { branch: "mateo/HAL-6250-work" });
    const parked = task(6251, agents.liam, { branch: "mateo/HAL-6251-work", parked: true });
    const watcher = passes([held, parked]);
    const pulls = [6250, 6251].map((number) => open(number, "", { failedRequired: [guardFailed] }));
    expect((await watcher.pass(pulls)).woken).toBe(1);
    expect((await watcher.pass(pulls)).woken).toBe(0);
    expect(watcher.wakes.map((wake) => wake.taskId)).toEqual(["task-6250"]);
  });
});

verifies("paperclip.pr-watcher-retargeted", () => {
  test("wakes the reviewer who holds the task once per head for a retargeted pull request (#6183)", async () => {
    const watcher = passes([task(6183, agents.liam, { branch: "mateo/HAL-6183-work" })]);
    const retargeted = open(6183, "", { retargeted: true });
    const first = await watcher.pass([retargeted]);
    const second = await watcher.pass([retargeted]);
    expect([first.woken, second.woken]).toEqual([1, 0]);
    expect(watcher.wakes).toEqual([
      { taskId: "task-6183", key: `${repo}#6183 ${head.slice(0, 7)} retargeted` },
    ]);
    const comments = watcher.watcherComments("task-6183");
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("Close and reopen it (or push a commit)");
    expect((await watcher.pass([{ ...retargeted, head: newHead }])).woken).toBe(1);
  });

  test("leaves a reviewer's task alone for a draft, a queued pull request, or a red or conflicting one", async () => {
    const watcher = passes([task(6184, agents.julian, { branch: "mateo/HAL-6184-work" })]);
    for (const pull of [
      open(6184, "", { retargeted: true, draft: true }),
      open(6184, "", { retargeted: true, inQueue: true }),
      open(6184, "", { ciOkOnHead: "failure", conflicting: true }),
    ]) {
      expect((await watcher.pass([pull])).woken).toBe(0);
    }
    expect(watcher.wakes).toEqual([]);
    expect(watcher.comments).toEqual({});
  });
});
