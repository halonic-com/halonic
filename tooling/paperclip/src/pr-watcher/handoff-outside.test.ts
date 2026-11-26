import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agents, task } from "./fakes.test-helper.ts";
import { mateoBranch, open, repo, setup } from "./handoff.test-helper.ts";

/**
 * Julian's approval outside his limits (HAL-17680): on #5653 the queue gate
 * refused it and nobody was told for 70 minutes. The watcher sends the task
 * to Liam on the same pass.
 */

const julianOnHead: Partial<PullFacts> = { approvals: [{ by: "Julian", head: "5701aaa" }] };

/** A watcher comment that handed head 5701aaa to Julian earlier. */
const handedToJulian = {
  authorAgentId: null,
  authorUserId: null,
  createdAt: "2026-11-24T15:00:00Z",
  body: `PR watcher: ready for review: #5701, head \`5701aaa\`.\n<!-- pr-watcher: ${repo}#5701 5701aaa ready -->`,
};

verifies("paperclip.pr-watcher-handoff", () => {
  test("hands the task to Liam once when Julian's approval is outside his limits", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch, julianOnHead)],
      comments: { "task-5701": [handedToJulian] },
      byPaths: "liam",
    });
    expect(await watcher.run()).toMatchObject({ handedOff: 1, failed: [] });
    expect(await watcher.run()).toMatchObject({ handedOff: 0 });
    expect(watcher.handoffs).toEqual([
      {
        taskId: "task-5701",
        from: agents.mateo,
        to: agents.liam,
        key: `${repo}#5701 5701aaa outside julian`,
      },
    ]);
    const body = watcher.comments["task-5701"]?.at(-1)?.body ?? "";
    expect(body).toContain(
      "Julian's approval on #5701 doesn't count: only the code reviewer may approve it (HAL-14809).",
    );
  });

  test("leaves a pull request on Liam's paths with Julian's rebase-only re-approval, and gives Liam a security one", async () => {
    const approvals = [
      { by: "Liam", head: "4999bbb" },
      { by: "Julian", head: "5701aaa", rebaseOf: "4999bbb" },
    ];
    const lockfile = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch, { approvals })],
      byPaths: "liam",
      files: ["pnpm-lock.yaml"],
    });
    await lockfile.run();
    expect(lockfile.handoffs).toEqual([]);
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch, { approvals })],
      byPaths: "liam",
      files: ["packages/x/src/sandbox/fence.ts"],
    });
    await watcher.run();
    expect(watcher.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
  });

  test("leaves it when Julian's approval counts: within his limits or beside Liam's", async () => {
    const cases: { extra: Partial<PullFacts>; byPaths: "julian" | "liam" }[] = [
      { extra: julianOnHead, byPaths: "julian" },
      {
        extra: {
          approvals: [
            { by: "Julian", head: "5701aaa" },
            { by: "Liam", head: "5701aaa" },
          ],
        },
        byPaths: "liam",
      },
    ];
    for (const { extra, byPaths } of cases) {
      const watcher = setup({
        tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
        pulls: [open(5701, mateoBranch, extra)],
        byPaths,
      });
      await watcher.run();
      expect(watcher.handoffs).toEqual([]);
    }
  });

  test("leaves Liam's own pull request, where Julian's approval counts on any path", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.liam, { branch: "liam/HAL-5701-work" })],
      pulls: [open(5701, "liam/HAL-5701-work", julianOnHead)],
      byPaths: "liam",
    });
    await watcher.run();
    expect(watcher.handoffs).toEqual([]);
    expect(watcher.routed).toEqual([]);
  });
});
