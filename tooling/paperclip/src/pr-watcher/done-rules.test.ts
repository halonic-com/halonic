import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { marker } from "./decide.ts";
import {
  agentComment,
  agents,
  fakeGitHub,
  fakePaperclip,
  recording,
  restFacts,
  task,
} from "./fakes.test-helper.ts";
import { isSelf } from "./memory.ts";
import { tick } from "./watch.ts";

/**
 * The rules that keep a task open now that the watcher finds pull requests
 * by branch and so sees more tasks than the ones that linked a pull request.
 */

function run(github: ReturnType<typeof fakeGitHub>, paperclip: ReturnType<typeof fakePaperclip>) {
  const lines: string[] = [];
  const summary = tick({
    paperclip: paperclip.paperclip,
    facts: restFacts(github.get),
    discover: paperclip.discover,
    dryRun: false,
    log: (line) => lines.push(line),
    now: new Date("2026-11-21T22:00:00Z"),
  });
  return { summary, lines };
}

const halonic = "halonic-com/halonic";

/** Pull request 9001: closed without merging, on Priya's branch. */
const closedUnmerged = {
  "/repos/halonic-com/halonic/pulls/9001": {
    html_url: "https://github.com/halonic-com/halonic/pull/9001",
    state: "closed",
    merged_at: null,
    merge_commit_sha: null,
    mergeable: null,
    head: { sha: "9001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ref: "priya/HAL-4485-first-try" },
    base: { ref: "main" },
  },
};

verifies("paperclip.pr-watcher-done", () => {
  test("ignores a pull request that closed without merging", async () => {
    const both = {
      ...task(4485, agents.priya),
      pulls: [
        { repo: halonic, number: 9001, branch: "priya/HAL-4485-first-try" },
        { repo: halonic, number: 4485, branch: "priya/HAL-4485-work" },
      ],
    };
    const paperclip = fakePaperclip([both]);
    const github = fakeGitHub(closedUnmerged, recording("merged-green"));
    expect(await run(github, paperclip).summary).toEqual({
      checked: 1,
      done: 1,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      dedupedWake: 0,
      dedupedUnchanged: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    expect(paperclip.comments["task-4485"]?.[0]?.body).not.toContain("#9001");
  });

  test("does nothing, and logs it, when the branch names another agent than the assignee", async () => {
    const paperclip = fakePaperclip([task(4485, agents.priya, { branch: "mateo/HAL-4485-work" })]);
    const github = fakeGitHub(recording("merged-green"));
    const { summary, lines } = run(github, paperclip);
    expect((await summary).done).toBe(0);
    expect(lines).toEqual([
      "HAL-4485: nothing to do (its branches don't all name the agent that holds it)",
    ]);
    // Decided on the branch names alone: no GitHub reads.
    expect(github.calls).toEqual([]);
  });

  test("does nothing when the task's branches name different agents", async () => {
    const mixed = {
      ...task(4485, agents.priya),
      pulls: [
        { repo: halonic, number: 4485, branch: "priya/HAL-4485-work" },
        { repo: halonic, number: 4614, branch: "mateo/HAL-4485-fix" },
      ],
    };
    const paperclip = fakePaperclip([mixed]);
    const github = fakeGitHub(recording("merged-green"), recording("red-and-conflicting"));
    expect((await run(github, paperclip).summary).done).toBe(0);
    expect(paperclip.done).toEqual([]);
  });

  test("keeps the task open while it has a child task that isn't done", async () => {
    const parent = task(4485, agents.priya, { openChildren: true });
    const paperclip = fakePaperclip([parent]);
    const github = fakeGitHub(recording("merged-green"));
    const { summary, lines } = run(github, paperclip);
    expect((await summary).done).toBe(0);
    expect(lines[0]).toContain("it has a child task that isn't done");
    const finished = fakePaperclip([{ ...parent, openChildren: false }]);
    expect((await run(github, finished).summary).done).toBe(1);
  });

  // HAL-12499, HAL-15492 and HAL-15889 in the 22 Nov dry run: merged green, still open work.
  test("wakes the author once, instead of closing, when the task got a comment after the merge", async () => {
    const github = fakeGitHub(recording("merged-green"));
    // #4485 merged at 20:48; this comment adds a follow-up to the same task.
    const later = agentComment(agents.liam, "2026-11-21T21:30:00Z", "Also reword the changeset.");
    const paperclip = fakePaperclip([task(4485, agents.priya)], { "task-4485": [later] });
    const first = run(github, paperclip);
    expect(await first.summary).toEqual({
      checked: 1,
      done: 0,
      woken: 1,
      postponed: 0,
      postponeRefused: 0,
      dedupedWake: 0,
      dedupedUnchanged: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    expect(paperclip.wakes).toEqual([
      { taskId: "task-4485", key: "halonic-com/halonic#4485 c0f13fa merged" },
    ]);
    expect(paperclip.comments["task-4485"]?.at(-1)?.body).toContain("Mark it done if nothing");
    const second = run(github, paperclip);
    expect(await second.summary).toEqual({
      checked: 1,
      done: 0,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      dedupedWake: 0,
      dedupedUnchanged: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    expect(second.lines[0]).toContain("it got comments after its merge");
  });

  test("still closes the task when every comment is older than the merge", async () => {
    const github = fakeGitHub(recording("merged-green"));
    const earlier = agentComment(agents.priya, "2026-11-21T20:00:00Z", "Ready for review.");
    const paperclip = fakePaperclip([task(4485, agents.priya)], { "task-4485": [earlier] });
    expect((await run(github, paperclip).summary).done).toBe(1);
  });
});

verifies("paperclip.pr-watcher-wake", () => {
  test("counts only its own comments as an earlier report, not a person's that looks alike", async () => {
    const github = fakeGitHub(recording("red-and-conflicting"));
    const reported = `PR watcher: this needs you.\n\n${marker("halonic-com/halonic#4614 7dd0ccf ci-red")}`;
    const fromUser = {
      authorAgentId: null,
      authorUserId: "user-1",
      createdAt: "2026-11-21T21:00:00Z",
      body: reported,
    };
    expect(isSelf(fromUser)).toBe(false);
    expect(isSelf({ ...fromUser, authorUserId: null })).toBe(true);
    const paperclip = fakePaperclip([task(4614, agents.mateo)], { "task-4614": [fromUser] });
    expect((await run(github, paperclip).summary).woken).toBe(1);
    expect(paperclip.wakes).toEqual([
      {
        taskId: "task-4614",
        key: "halonic-com/halonic#4614 7dd0ccf ci-red | halonic-com/halonic#4614 7dd0ccf conflict",
      },
    ]);
  });

  test("doesn't wake for a conflict on a draft, only for its red ci-ok", async () => {
    const red = recording("red-and-conflicting");
    const path = "/repos/halonic-com/halonic/pulls/4614";
    const draft = { ...red, [path]: { ...(red[path] as object), draft: true } };
    const paperclip = fakePaperclip([task(4614, agents.mateo)]);
    expect((await run(fakeGitHub(draft), paperclip).summary).woken).toBe(1);
    expect(paperclip.wakes).toEqual([
      { taskId: "task-4614", key: "halonic-com/halonic#4614 7dd0ccf ci-red" },
    ]);
  });
});
