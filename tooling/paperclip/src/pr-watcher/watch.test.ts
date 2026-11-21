import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  agents,
  fakeGitHub,
  fakePaperclip,
  recording,
  task,
  watcherId,
} from "./fakes.test-helper.ts";
import { tick } from "./watch.ts";

function run(github: ReturnType<typeof fakeGitHub>, paperclip: ReturnType<typeof fakePaperclip>) {
  const lines: string[] = [];
  const summary = tick({
    paperclip: paperclip.paperclip,
    get: github.get,
    selfId: watcherId,
    dryRun: false,
    log: (line) => lines.push(line),
  });
  return { summary, lines };
}

verifies("paperclip.pr-watcher-done", () => {
  test("marks the task done when ci-ok passed on the merge commit", async () => {
    const paperclip = fakePaperclip([task(4485, agents.priya)]);
    const { summary } = run(fakeGitHub(recording("merged-green")), paperclip);
    expect(await summary).toEqual({ checked: 1, done: 1, woken: 0, failed: [] });
    expect(paperclip.done).toEqual(["task-4485"]);
    expect(paperclip.comments["task-4485"]?.[0]?.body).toContain(
      "[#4485](https://github.com/halonic-com/halonic/pull/4485) merged",
    );
  });

  test("marks it done when main's newest green CI run includes the merge", async () => {
    // #468 merged on 9 Nov; its merge commit has no ci-ok, a later main run is green.
    const paperclip = fakePaperclip([task(468, agents.priya)]);
    const { summary } = run(fakeGitHub(recording("merged-main-green")), paperclip);
    expect(await summary).toEqual({ checked: 1, done: 1, woken: 0, failed: [] });
  });

  test("waits while no green run includes the merge yet", async () => {
    // #4574's ci-ok on main is still queued, and the newest green run is older.
    const paperclip = fakePaperclip([task(4574, agents.mateo)]);
    const { summary, lines } = run(fakeGitHub(recording("merged-waiting")), paperclip);
    expect(await summary).toEqual({ checked: 1, done: 0, woken: 0, failed: [] });
    expect(lines[0]).toContain("waiting for a green ci-ok");
    expect(paperclip.comments).toEqual({});
  });

  test("leaves a task alone until every linked pull request is closed", async () => {
    const both = {
      ...task(4485, agents.priya),
      links: [
        "https://github.com/halonic-com/halonic/pull/4485",
        "https://github.com/halonic-com/halonic/pull/4588",
      ],
    };
    const paperclip = fakePaperclip([both], {
      "task-4485": [{ authorAgentId: agents.priya, createdAt: "2026-11-21T21:00:00Z", body: "" }],
    });
    const github = fakeGitHub(recording("merged-green"), recording("review-finding"));
    expect(await run(github, paperclip).summary).toEqual({
      checked: 1,
      done: 0,
      woken: 0,
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

  test("wakes the author for a tagged finding newer than their last comment", async () => {
    const author = {
      authorAgentId: agents.priya,
      createdAt: "2026-11-21T20:50:00Z",
      body: "Pushed.",
    };
    const paperclip = fakePaperclip([task(4588, agents.priya)], { "task-4588": [author] });
    expect((await run(fakeGitHub(recording("review-finding")), paperclip).summary).woken).toBe(1);
    expect(paperclip.comments["task-4588"]?.at(-1)?.body).toContain("a new review comment");
  });

  test("leaves a finding alone that the author commented after", async () => {
    const author = {
      authorAgentId: agents.priya,
      createdAt: "2026-11-21T21:00:00Z",
      body: "Fixed.",
    };
    const paperclip = fakePaperclip([task(4588, agents.priya)], { "task-4588": [author] });
    expect((await run(fakeGitHub(recording("review-finding")), paperclip).summary).woken).toBe(0);
  });

  test("does nothing while the reviewer holds the task or the author is running", async () => {
    const github = fakeGitHub(recording("red-and-conflicting"));
    const paperclip = fakePaperclip([
      task(4614, agents.liam),
      { ...task(4614, agents.mateo, { running: true }), id: "task-running" },
    ]);
    expect((await run(github, paperclip).summary).woken).toBe(0);
    expect(paperclip.comments).toEqual({});
  });

  test("does nothing for a green pull request without findings", async () => {
    const paperclip = fakePaperclip([task(4605, agents.mateo)]);
    const { summary, lines } = run(fakeGitHub(recording("green")), paperclip);
    expect(await summary).toEqual({ checked: 1, done: 0, woken: 0, failed: [] });
    expect(lines).toEqual(["HAL-4605: nothing to do (nothing new)"]);
  });
});

verifies("paperclip.pr-watcher-read-only", () => {
  test("sends only GET requests to api.github.com", async () => {
    const github = fakeGitHub(
      recording("red-and-conflicting"),
      recording("merged-green"),
      recording("review-finding"),
    );
    const paperclip = fakePaperclip([
      task(4614, agents.mateo),
      task(4485, agents.priya),
      task(4588, agents.priya),
    ]);
    expect((await run(github, paperclip).summary).failed).toEqual([]);
    expect(github.calls.length).toBeGreaterThan(10);
    for (const call of github.calls) {
      expect(call.method).toBe("GET");
      expect(new URL(call.url).origin).toBe("https://api.github.com");
    }
  });

  test("refuses a path that leads to another host", async () => {
    const github = fakeGitHub();
    await expect(github.get("https://example.com/repos")).rejects.toThrow(
      "refusing to send the token",
    );
    expect(github.calls).toEqual([]);
  });
});
