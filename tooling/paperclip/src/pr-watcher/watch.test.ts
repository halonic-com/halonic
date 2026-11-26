import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  agentComment,
  agents,
  fakeGitHub,
  fakePaperclip,
  recording,
  restFacts,
  task,
} from "./fakes.test-helper.ts";
import { asksForChanges } from "./github.ts";
import { tick } from "./watch.ts";

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

verifies("paperclip.pr-watcher-done", () => {
  test("marks the task done when ci-ok passed on the merge commit", async () => {
    const paperclip = fakePaperclip([task(4485, agents.priya)]);
    const { summary } = run(fakeGitHub(recording("merged-green")), paperclip);
    expect(await summary).toEqual({
      checked: 1,
      done: 1,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    expect(paperclip.done).toEqual(["task-4485"]);
    expect(paperclip.comments["task-4485"]?.[0]?.body).toContain(
      "[#4485](https://github.com/halonic-com/halonic/pull/4485) merged",
    );
  });

  test("marks it done when main's newest green CI run includes the merge", async () => {
    // #468 merged on 9 Nov; its merge commit has no ci-ok, a later main run is green.
    const paperclip = fakePaperclip([task(468, agents.priya)]);
    const { summary } = run(fakeGitHub(recording("merged-main-green")), paperclip);
    expect(await summary).toEqual({
      checked: 1,
      done: 1,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
  });

  test("waits while no green run includes the merge yet", async () => {
    // #4574's ci-ok on main is still queued, and the newest green run is older.
    const paperclip = fakePaperclip([task(4574, agents.mateo)]);
    const { summary, lines } = run(fakeGitHub(recording("merged-waiting")), paperclip);
    expect(await summary).toEqual({
      checked: 1,
      done: 0,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    expect(lines[0]).toContain("waiting for a green ci-ok");
    expect(paperclip.comments).toEqual({});
  });

  test("keeps the task open while the author's newest comment, after the merge, says more PRs are coming", async () => {
    // #4485 merged at 20:48.
    const hold = agentComment(
      agents.priya,
      "2026-11-21T21:00:00Z",
      "First PR is in.\n\nPR watcher: more PRs to come",
    );
    const paperclip = fakePaperclip([task(4485, agents.priya)], { "task-4485": [hold] });
    const github = fakeGitHub(recording("merged-green"));
    const { summary, lines } = run(github, paperclip);
    expect(await summary).toEqual({
      checked: 1,
      done: 0,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    expect(lines[0]).toContain("more pull requests are coming");
    // A newer comment from the author without the line lifts the hold; written after the merge, it asks the author once.
    paperclip.comments["task-4485"]?.push(
      agentComment(agents.priya, "2026-11-21T21:30:00Z", "Nothing else comes."),
    );
    expect((await run(github, paperclip).summary).woken).toBe(1);
  });

  // HAL-17445: the hold line under every comment kept a merged task, and the one it blocked, open for 4 hours.
  test("closes the task when the author wrote the hold line before the merge", async () => {
    const before = agentComment(
      agents.priya,
      "2026-11-21T20:00:00Z",
      "Waiting for the queue session.\n\nPR watcher: more PRs to come",
    );
    const paperclip = fakePaperclip([task(4485, agents.priya)], { "task-4485": [before] });
    const { summary } = run(fakeGitHub(recording("merged-green")), paperclip);
    expect((await summary).done).toBe(1);
    expect(paperclip.done).toEqual(["task-4485"]);
  });

  test("leaves a task alone until every pull request found for it is closed", async () => {
    const both = {
      ...task(4485, agents.priya),
      pulls: [
        { repo: "halonic-com/halonic", number: 4485, branch: "priya/HAL-4485-one" },
        { repo: "halonic-com/halonic", number: 4588, branch: "priya/HAL-4485-two" },
      ],
    };
    const paperclip = fakePaperclip([both], {
      "task-4485": [agentComment(agents.priya, "2026-11-21T21:00:00Z", "")],
    });
    const github = fakeGitHub(recording("merged-green"), recording("review-finding"));
    expect(await run(github, paperclip).summary).toEqual({
      checked: 1,
      done: 0,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
  });
});

verifies("paperclip.pr-watcher-wake", () => {
  test("wakes the author once for a red ci-ok and a conflict outside the queue", async () => {
    const github = fakeGitHub(recording("red-and-conflicting"));
    const paperclip = fakePaperclip([task(4614, agents.mateo)]);
    expect((await run(github, paperclip).summary).woken).toBe(1);
    const body = paperclip.comments["task-4614"]?.[0]?.body ?? "";
    expect(body).toContain("`ci-ok` failed on its head `7dd0ccf`.");
    expect(body).toContain("conflicts with its base branch and isn't in the merge queue");
    expect((await run(github, paperclip).summary).woken).toBe(0);
    expect(paperclip.comments["task-4614"]).toHaveLength(1);
  });

  test("leaves a task its author closed during the pass alone, without failing", async () => {
    // HAL-16139, 22 Nov: the author marked it done between the watcher's list and its wake-up.
    const github = fakeGitHub(recording("red-and-conflicting"), recording("merged-green"));
    const paperclip = fakePaperclip(
      [task(4614, agents.mateo), task(4485, agents.priya)],
      {},
      new Set(["task-4614", "task-4485"]),
    );
    const { summary, lines } = run(github, paperclip);
    expect(await summary).toEqual({
      checked: 2,
      done: 0,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    expect(lines.filter((line) => line.endsWith("closed during this pass, so left alone"))).toEqual(
      [
        "HAL-4614: closed during this pass, so left alone",
        "HAL-4485: closed during this pass, so left alone",
      ],
    );
    expect(paperclip.comments).toEqual({});
  });

  test("wakes the author for a tagged finding newer than their last comment", async () => {
    const author = agentComment(agents.priya, "2026-11-21T20:50:00Z", "Pushed.");
    const paperclip = fakePaperclip([task(4588, agents.priya)], { "task-4588": [author] });
    expect((await run(fakeGitHub(recording("review-finding")), paperclip).summary).woken).toBe(1);
    expect(paperclip.comments["task-4588"]?.at(-1)?.body).toContain("a new review comment");
  });

  test("leaves a finding alone that the author commented after", async () => {
    const author = agentComment(agents.priya, "2026-11-21T21:00:00Z", "Fixed.");
    const paperclip = fakePaperclip([task(4588, agents.priya)], { "task-4588": [author] });
    expect((await run(fakeGitHub(recording("review-finding")), paperclip).summary).woken).toBe(0);
  });

  test("ignores an approval, a nit and a negated or answered changes requested", async () => {
    const pulls = "/repos/halonic-com/halonic/pulls/4588";
    const head = "7651f8c1e4af38752f56d353156c5dd19ff54984";
    const quiet = {
      [`${pulls}/reviews?per_page=100&page=1`]: [
        {
          id: 1,
          commit_id: head,
          state: "COMMENTED",
          submitted_at: "2026-11-21T21:10:00Z",
          body: "LGTM",
          author_association: "MEMBER",
        },
      ],
      "/repos/halonic-com/halonic/issues/4588/comments?per_page=100&page=1": [
        {
          id: 2,
          created_at: "2026-11-21T21:11:00Z",
          body: "Julian: approved. No changes requested.",
          author_association: "MEMBER",
        },
        {
          id: 3,
          created_at: "2026-11-21T21:12:00Z",
          body: "- [nit] a word",
          author_association: "MEMBER",
        },
        {
          id: 4,
          created_at: "2026-11-21T21:13:00Z",
          body: "Addressed the changes requested.",
          author_association: "MEMBER",
        },
      ],
    };
    const paperclip = fakePaperclip([task(4588, agents.priya)]);
    const github = fakeGitHub(recording("review-finding"), quiet);
    expect((await run(github, paperclip).summary).woken).toBe(0);
  });

  test("ignores findings from people who aren't owners, members or collaborators", async () => {
    const pulls = "/repos/halonic-com/halonic/pulls/4588";
    const head = "7651f8c1e4af38752f56d353156c5dd19ff54984";
    const stranger = (id: number, at: string) => ({
      id,
      commit_id: head,
      original_commit_id: head,
      state: "CHANGES_REQUESTED",
      created_at: at,
      submitted_at: at,
      body: "- [major] (a stranger's finding)",
      author_association: "NONE",
    });
    const outsiders = {
      [`${pulls}/reviews?per_page=100&page=1`]: [stranger(1, "2026-11-21T21:10:00Z")],
      [`${pulls}/comments?sort=created&direction=desc&per_page=100`]: [
        { ...stranger(2, "2026-11-21T21:11:00Z"), author_association: "CONTRIBUTOR" },
      ],
      "/repos/halonic-com/halonic/issues/4588/comments?per_page=100&page=1": [
        { ...stranger(3, "2026-11-21T21:12:00Z"), author_association: "FIRST_TIMER" },
        { ...stranger(4, "2026-11-21T21:13:00Z"), author_association: undefined },
      ],
    };
    const paperclip = fakePaperclip([task(4588, agents.priya)]);
    const github = fakeGitHub(recording("review-finding"), outsiders);
    expect((await run(github, paperclip).summary).woken).toBe(0);
  });

  test("tells a verdict that asks for changes from one that doesn't", () => {
    expect(asksForChanges("Liam: changes requested on head `0cebc4e`.")).toBe(true);
    expect(asksForChanges("**Changes requested**")).toBe(true);
    expect(asksForChanges("Intro.\n- [minor] fix the regex")).toBe(true);
    expect(asksForChanges("No changes requested.")).toBe(false);
    expect(asksForChanges("Liam: no changes requested, approved.")).toBe(false);
    expect(asksForChanges("I addressed the changes requested.")).toBe(false);
    expect(asksForChanges("LGTM")).toBe(false);
  });

  test("does nothing while the reviewer holds the task or the author is running", async () => {
    const github = fakeGitHub(recording("red-and-conflicting"));
    const paperclip = fakePaperclip([
      task(4614, agents.liam, { branch: "mateo/HAL-4614-work" }),
      { ...task(4614, agents.mateo, { running: true }), id: "task-running" },
    ]);
    expect((await run(github, paperclip).summary).woken).toBe(0);
    expect(paperclip.comments).toEqual({});
  });

  test("wakes nobody for a green pull request without findings", async () => {
    const paperclip = fakePaperclip([task(4605, agents.mateo)]);
    const { summary, lines } = run(fakeGitHub(recording("green")), paperclip);
    expect(await summary).toEqual({
      checked: 1,
      done: 0,
      woken: 0,
      postponed: 0,
      postponeRefused: 0,
      handedOff: 0,
      warned: 0,
      reviewWaits: 0,
      priorityRaised: 0,
      rerouted: 0,
      bothLimited: 0,
      longestWaits: [],
      failed: [],
    });
    // Ready for review: without a reviewer route it stays with its author (paperclip.pr-watcher-handoff).
    expect(lines).toEqual([
      "HAL-4605: ready for review, but no reviewer route is set",
      "HAL-4605: nothing to do (nothing new)",
    ]);
    expect(paperclip.wakes).toEqual([]);
  });
});

verifies("paperclip.pr-watcher-read-only", () => {
  test("refuses a path that leads to another host", async () => {
    const github = fakeGitHub();
    await expect(github.get("https://example.com/repos")).rejects.toThrow(
      "refusing to send the token",
    );
    expect(github.calls).toEqual([]);
  });
});
