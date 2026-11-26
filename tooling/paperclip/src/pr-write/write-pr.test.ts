import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test, vi } from "vitest";
import { refusal, type WriteRequest } from "./write-client.ts";
import { isOwnBranch, markReady, readWritePrParams, withBuiltOnLine, writePr } from "./write-pr.ts";

const repo = "halonic-com/halonic";
const branch = "priya/HAL-18983-pr-write-tools";

/** An open pull request on `ref`, as the REST API lists it. */
function pull(number: number, ref: string, draft: boolean) {
  return {
    number,
    node_id: `PR_${number}`,
    html_url: `https://github.com/${repo}/pull/${number}`,
    draft,
    state: "open",
    head: { ref, repo: { full_name: repo } },
  };
}

/** Fake reads and writes: `open` is what GitHub lists for the branch. */
function setUp(open: ReturnType<typeof pull>[] = []) {
  const sent: WriteRequest[] = [];
  const get = vi.fn(async (path: string) => {
    if (path.startsWith(`/repos/${repo}/pulls?head=`)) return open;
    const found = open.find((one) => path === `/repos/${repo}/pulls/${one.number}`);
    if (found === undefined) throw new Error(`GitHub: GET ${path} answered 404.`);
    return found;
  });
  const write = vi.fn(async (request: WriteRequest) => {
    // Every request the tool builds must pass the client's own check.
    expect(refusal(request)).toBeUndefined();
    sent.push(request);
    return request.url.endsWith("/pulls") ? pull(6400, branch, true) : {};
  });
  return { sent, get, deps: { get, write, agentKey: "priya" } };
}

const request = (change: Record<string, unknown> = {}) =>
  readWritePrParams({ branch, title: "feat(x): y (HAL-18983)", body: "What changed.", ...change });

verifies("paperclip.pr-write-tool", () => {
  describe("write_pr", () => {
    test("opens a draft against main with the built-on label and line when the branch has none", async () => {
      const { sent, deps } = setUp();
      const result = await writePr(deps, request());
      expect(result).toMatchObject({ number: 6400, opened: true, draft: true });
      expect(JSON.parse(sent[0]?.body ?? "")).toEqual({
        title: "feat(x): y (HAL-18983)",
        body: "What changed.\n\nBuilt-on: paperclip\n",
        head: branch,
        base: "main",
        draft: true,
      });
      expect(sent[1]?.url).toBe(`https://api.github.com/repos/${repo}/issues/6400/labels`);
      expect(JSON.parse(sent[1]?.body ?? "")).toEqual({ labels: ["built-on:paperclip"] });
    });

    test("updates only what it names on the open pull request, and marks it ready", async () => {
      const { sent, deps } = setUp([pull(6300, branch, true)]);
      const result = await writePr(
        deps,
        readWritePrParams({ branch, title: "fix: z (HAL-18983)", state: "ready" }),
      );
      expect(result).toMatchObject({
        number: 6300,
        opened: false,
        draft: false,
        changed: ["title", "ready"],
      });
      expect(sent.map((one) => one.method)).toEqual(["PATCH", "POST"]);
      expect(JSON.parse(sent[0]?.body ?? "")).toEqual({ title: "fix: z (HAL-18983)" });
      expect(JSON.parse(sent[1]?.body ?? "").variables).toEqual({ pullRequestId: "PR_6300" });
    });

    test("sends nothing when the pull request already is as asked", async () => {
      const { sent, deps } = setUp([pull(6300, branch, false)]);
      expect((await writePr(deps, readWritePrParams({ branch, state: "ready" }))).changed).toEqual(
        [],
      );
      expect(sent).toEqual([]);
    });

    test("refuses a teammate's branch, and opening without title and body, before any write", async () => {
      const { sent, deps } = setUp();
      await expect(writePr(deps, request({ branch: "liam/HAL-1-other" }))).rejects.toThrow(
        "isn't your branch",
      );
      await expect(writePr(deps, readWritePrParams({ branch }))).rejects.toThrow(
        "needs title and body",
      );
      expect(sent).toEqual([]);
    });

    test("refuses fast-track and every label but the built-on ones", () => {
      for (const labels of [["fast-track"], ["built-on:paperclip", "queue-hold"], "fast-track"]) {
        expect(() => readWritePrParams({ branch, labels })).toThrow(
          "fast-track and the queue's labels",
        );
      }
      expect(readWritePrParams({ branch, labels: ["built-on:halonic"] }).labels).toEqual([
        "built-on:halonic",
      ]);
    });

    test("keeps a body's own built-on line", () => {
      expect(withBuiltOnLine("Text\n\nBuilt-on: halonic")).toBe("Text\n\nBuilt-on: halonic");
    });

    test("knows the agent's own branches", () => {
      expect(isOwnBranch(branch, "priya")).toBe(true);
      expect(isOwnBranch("priya/HAL-1", "priya")).toBe(false);
      expect(isOwnBranch("priyanka/HAL-1-x", "priya")).toBe(false);
      expect(isOwnBranch("main", "priya")).toBe(false);
    });
  });

  describe("the closing call's ready step", () => {
    test("marks the caller's own draft ready, and says when it already was", async () => {
      const draft = setUp([pull(6300, branch, true)]);
      expect(await markReady(draft.deps, 6300)).toBe("#6300 is marked ready.");
      expect(draft.sent).toHaveLength(1);
      const ready = setUp([pull(6300, branch, false)]);
      expect(await markReady(ready.deps, 6300)).toBe("#6300 was already ready.");
      expect(ready.sent).toEqual([]);
    });

    test("refuses a teammate's pull request", async () => {
      const { sent, deps } = setUp([pull(6301, "liam/HAL-2-other", true)]);
      await expect(markReady(deps, 6301)).rejects.toThrow("isn't your branch");
      expect(sent).toEqual([]);
    });
  });
});
