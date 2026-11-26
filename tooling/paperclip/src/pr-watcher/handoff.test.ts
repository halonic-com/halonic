import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agentComment, agents, type FakeTask, task } from "./fakes.test-helper.ts";
import { head, mateoBranch, oldHead, open, repo, setup } from "./handoff.test-helper.ts";

/** The review handoff and the push-after-approval warning (HAL-17675), on facts given directly. */

verifies("paperclip.pr-watcher-handoff", () => {
  test("hands a ready, green pull request's task to Julian once, with a one-line comment", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch)],
    });
    expect(await watcher.run()).toMatchObject({ handedOff: 1, woken: 0, failed: [] });
    expect(await watcher.run()).toMatchObject({ handedOff: 0 });
    expect(watcher.handoffs).toEqual([
      {
        taskId: "task-5701",
        from: agents.mateo,
        to: agents.julian,
        key: `${repo}#5701 5701aaa ready`,
      },
    ]);
    const [comment] = watcher.comments["task-5701"] ?? [];
    expect(comment?.body.split("\n")[0]).toBe(
      `PR watcher: ready for review: [#5701](https://github.com/${repo}/pull/5701), head \`5701aaa\`.`,
    );
  });

  test("hands it to Liam when the path rules say Liam", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch)],
      byPaths: "liam",
    });
    await watcher.run();
    expect(watcher.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
  });

  test("hands a routine pull request to Nora (HAL-19283)", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch)],
      byPaths: "nora",
    });
    await watcher.run();
    expect(watcher.handoffs.map(({ to }) => to)).toEqual([agents.nora]);
  });

  test("hands it on when Nora's approval on the head is outside the routine scope", async () => {
    const approved = open(5701, mateoBranch, {
      approvals: [{ by: "Nora", head: head.slice(0, 7) }],
    });
    const outside = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [approved],
      routineRefusal: "touches packages/core/app/src/a.ts",
    });
    await outside.run();
    expect(outside.handoffs.map(({ to, key }) => [to, key])).toEqual([
      [agents.julian, `${repo}#5701 5701aaa outside julian`],
    ]);
    const inside = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [approved],
      byPaths: "nora",
      routineRefusal: null,
    });
    await inside.run();
    expect(inside.handoffs).toEqual([]);
  });

  test("sends Liam's own pull request to Julian and Julian's to Liam, whatever the paths say", async () => {
    const liams = setup({
      tasks: [task(5701, agents.liam, { branch: "liam/HAL-5701-work" })],
      pulls: [open(5701, "liam/HAL-5701-work")],
      byPaths: "liam",
    });
    await liams.run();
    expect(liams.handoffs.map(({ to }) => to)).toEqual([agents.julian]);
    const julians = setup({
      tasks: [task(5701, agents.julian, { branch: "julian/HAL-5701-work" })],
      pulls: [open(5701, "julian/HAL-5701-work")],
    });
    await julians.run();
    expect(julians.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
  });

  test("leaves the task with its author while anything on it waits for them", async () => {
    const notReady: Partial<PullFacts>[] = [
      { draft: true },
      { ciOkOnHead: "pending" },
      { ciOkOnHead: "failure" },
      { conflicting: true },
      { retargeted: true },
      { latestReview: { id: "r1", at: "2026-11-24T16:00:00Z" } },
      { approvals: [{ by: "Julian", head: "5701aaa" }] },
    ];
    for (const extra of notReady) {
      const watcher = setup({
        tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
        pulls: [open(5701, mateoBranch, extra)],
      });
      await watcher.run();
      expect(watcher.handoffs).toEqual([]);
    }
  });

  test("leaves it while another of its pull requests is still a draft", async () => {
    const second = "mateo/HAL-5701-second";
    const both = {
      ...task(5701, agents.mateo),
      pulls: [
        { repo, number: 5701, branch: mateoBranch },
        { repo, number: 5702, branch: second },
      ],
    };
    const watcher = setup({
      tasks: [both],
      pulls: [open(5701, mateoBranch), open(5702, second, { draft: true })],
    });
    await watcher.run();
    expect(watcher.handoffs).toEqual([]);
  });

  test("leaves a task its author is running on, one with an open child task, and one held by its reviewer", async () => {
    const cases: FakeTask[] = [
      task(5701, agents.mateo, { branch: mateoBranch, running: true }),
      task(5701, agents.mateo, { branch: mateoBranch, openChildren: true }),
      task(5701, agents.julian, { branch: mateoBranch }),
    ];
    for (const held of cases) {
      const watcher = setup({ tasks: [held], pulls: [open(5701, mateoBranch)] });
      await watcher.run();
      expect(watcher.handoffs).toEqual([]);
    }
  });

  test("leaves a security or release pull request whose author said it has its own review task", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch)],
      comments: {
        "task-5701": [
          agentComment(
            agents.mateo,
            "2026-11-24T16:30:00Z",
            "Security PR.\n\nPR watcher: own review task",
          ),
        ],
      },
    });
    await watcher.run();
    expect(watcher.handoffs).toEqual([]);
    expect(watcher.routed).toEqual([]);
  });

  test("hands it over again only for a new head after the reviewer gave it back", async () => {
    const handedBack = (pullHead: string) =>
      setup({
        tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
        pulls: [open(5701, mateoBranch, { head: pullHead })],
        comments: {
          "task-5701": [
            {
              authorAgentId: null,
              authorUserId: null,
              createdAt: "2026-11-24T16:00:00Z",
              body: `PR watcher: ready for review: #5701, head \`5701aaa\`.\n<!-- pr-watcher: ${repo}#5701 5701aaa ready -->`,
            },
          ],
        },
      });
    const sameHead = handedBack(head);
    await sameHead.run();
    expect(sameHead.handoffs).toEqual([]);
    const newHead = handedBack("5702cccccccccccccccccccccccccccccccccccc");
    await newHead.run();
    expect(newHead.handoffs.map(({ key }) => key)).toEqual([`${repo}#5701 5702ccc ready`]);
  });

  test("reads no comments and no routes for a task with nothing ready", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch, { ciOkOnHead: "pending" })],
    });
    await watcher.run();
    expect(watcher.routed).toEqual([]);
  });
});

verifies("paperclip.pr-watcher-pushed-after-approval", () => {
  const approvedBefore = {
    approvals: [{ by: "Julian", head: "4999bbb" }],
    ciOkOnHead: "pending",
  } as const;

  test("warns once on the task when the author pushes after an approval", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch, approvedBefore)],
    });
    expect(await watcher.run()).toMatchObject({ warned: 1, woken: 0, handedOff: 0 });
    expect(await watcher.run()).toMatchObject({ warned: 0 });
    const bodies = (watcher.comments["task-5701"] ?? []).map(({ body }) => body);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.split("\n")[0]).toBe(
      "PR watcher: pushed after approval; this voids the approval.",
    );
    expect(bodies[0]).toContain("approved on `4999bbb`, now at `5701aaa`");
    expect(watcher.wakes).toEqual([]);
  });

  test("warns, then hands the green new head to the reviewer for a new approval", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch, { approvals: [{ by: "Julian", head: "4999bbb" }] })],
    });
    expect(await watcher.run()).toMatchObject({ warned: 1, handedOff: 1 });
  });

  test("says nothing when the push fixed a conflict the watcher reported on the approved head", async () => {
    const watcher = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [open(5701, mateoBranch, approvedBefore)],
      comments: {
        "task-5701": [
          {
            authorAgentId: null,
            authorUserId: null,
            createdAt: "2026-11-24T16:00:00Z",
            body: `PR watcher: this needs you.\n<!-- pr-watcher: ${repo}#5701 4999bbb conflict -->`,
          },
        ],
      },
    });
    expect(await watcher.run()).toMatchObject({ warned: 0 });
  });

  test("says nothing while it conflicts or is a draft, when the current head is approved, or without an approval", async () => {
    const quiet: Partial<PullFacts>[] = [
      { ...approvedBefore, conflicting: true },
      { ...approvedBefore, draft: true },
      {
        approvals: [
          { by: "Julian", head: "4999bbb" },
          { by: "Liam", head: "5701aaa" },
        ],
      },
      { approvals: [{ by: "Mateo", head: oldHead }], ciOkOnHead: "pending" },
      { ciOkOnHead: "pending" },
    ];
    for (const extra of quiet) {
      const watcher = setup({
        tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
        pulls: [open(5701, mateoBranch, extra)],
      });
      expect(await watcher.run()).toMatchObject({ warned: 0 });
    }
  });
});
