import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agentComment, agents, type FakeTask, task } from "./fakes.test-helper.ts";
import { mateoBranch, open, repo, setup } from "./handoff.test-helper.ts";
import type { Reviewer } from "./handoff.ts";

/** A change request the author answered goes back to the reviewer who asked (HAL-18460). */

const findingAt = "2026-11-24T15:00:00Z";

function asked(by: "Liam" | "Julian", extra: Partial<PullFacts> = {}): PullFacts {
  return open(5701, mateoBranch, {
    latestReview: { id: "i42", at: findingAt, by },
    headCommittedAt: "2026-11-24T14:00:00Z",
    ...extra,
  });
}

/** The author has seen the finding: a comment of theirs after it, so the watcher doesn't wake them for it. */
function watcher(
  pull: PullFacts,
  options: { byPaths?: Reviewer; authorAt?: string; extra?: Partial<FakeTask> } = {},
) {
  return setup({
    tasks: [task(5701, agents.mateo, { branch: mateoBranch, ...options.extra })],
    pulls: [pull],
    byPaths: options.byPaths ?? "julian",
    comments: {
      "task-5701": [
        agentComment(
          agents.mateo,
          options.authorAt ?? "2026-11-24T15:30:00Z",
          "Fixing Liam's point.",
        ),
      ],
    },
  });
}

const pushed = { headCommittedAt: "2026-11-24T16:00:00Z" };

verifies("paperclip.pr-watcher-answered-review", () => {
  test("hands a task back to Liam once after a push answers his change request, whatever the paths say", async () => {
    const answered = watcher(asked("Liam", pushed));
    expect(await answered.run()).toMatchObject({ handedOff: 1, woken: 0, failed: [] });
    expect(await answered.run()).toMatchObject({ handedOff: 0 });
    expect(answered.handoffs).toEqual([
      {
        taskId: "task-5701",
        from: agents.mateo,
        to: agents.liam,
        key: `${repo}#5701 5701aaa answered i42`,
      },
    ]);
    const body = answered.comments["task-5701"]?.at(-1)?.body ?? "";
    expect(body).toContain(
      "#5701: answers Liam's change request: a new head `5701aaa` pushed after it.",
    );
  });

  test("hands it to Julian after the author's reply on the task, with no short check pending", async () => {
    const replied = watcher(asked("Julian"), {
      extra: { monitorNextCheckAt: "2026-11-24T23:00:00Z" },
    });
    await replied.run();
    expect(replied.handoffs.map(({ to }) => to)).toEqual([agents.julian]);
    expect(replied.comments["task-5701"]?.at(-1)?.body).toContain(
      "answers Julian's change request: the author replied on this task after it.",
    );
  });

  test("sends Julian's answered request to Liam when the paths are Liam's", async () => {
    const liamPaths = watcher(asked("Julian", pushed), { byPaths: "liam" });
    await liamPaths.run();
    expect(liamPaths.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
  });

  test("leaves the task with its author while the finding is unanswered or the fix isn't ready", async () => {
    const cases = [
      // Only a progress note, while the author's own CI check is due within the hour.
      watcher(asked("Liam"), { extra: { monitorNextCheckAt: "2026-11-24T17:20:00Z" } }),
      // No push and no comment after the finding.
      watcher(asked("Liam"), { authorAt: "2026-11-24T14:30:00Z" }),
      // Pushed, but ci-ok is still running or red.
      watcher(asked("Liam", { ...pushed, ciOkOnHead: "pending" })),
      watcher(asked("Liam", { ...pushed, ciOkOnHead: "failure" })),
    ];
    for (const each of cases) {
      await each.run();
      expect(each.handoffs).toEqual([]);
    }
  });
});
