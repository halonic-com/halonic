import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { discoverPulls, taskOfBranch } from "./discover.ts";
import { fakeGitHub, recording } from "./fakes.test-helper.ts";

const now = new Date("2026-11-22T07:20:00Z");

verifies("paperclip.pr-watcher-plugin", () => {
  test("finds open and recently closed pull requests by the task their branch names", async () => {
    const github = fakeGitHub(recording("pull-lists"));
    const found = await discoverPulls(github.get, ["halonic-com/halonic"], now);
    expect(found.get("HAL-15930")).toEqual([
      { repo: "halonic-com/halonic", number: 4959, branch: "mateo/HAL-15930-ci-dynamic-memory" },
    ]);
    // A stacked pull request counts too: its base is another branch, not main.
    expect(found.get("HAL-15897")?.map((ref) => ref.number)).toEqual([4944]);
    expect(found.get("HAL-15830")?.map((ref) => ref.number)).toEqual([4910]);
    expect([...found.keys()].sort()).toEqual([
      "HAL-15525",
      "HAL-15830",
      "HAL-15897",
      "HAL-15905",
      "HAL-15930",
    ]);
  });

  test("lists a pull request that closed between the two reads once", async () => {
    const github = fakeGitHub(recording("pull-lists"));
    const found = await discoverPulls(github.get, ["halonic-com/halonic"], now);
    expect(found.get("HAL-15905")?.map((ref) => ref.number)).toEqual([4957]);
  });

  test("leaves out a pull request closed more than 3 days ago", async () => {
    const github = fakeGitHub(recording("pull-lists"));
    const found = await discoverPulls(github.get, ["halonic-com/halonic"], now);
    expect(found.has("HAL-1375")).toBe(false);
  });

  test("reads the next page of closed pull requests only while they are all recent", async () => {
    const closed = (page: number) =>
      `/repos/acme/tools/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`;
    const full = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      updated_at: "2026-11-22T06:00:00Z",
      head: { ref: `mateo/HAL-${index + 1}-x`, repo: { full_name: "acme/tools" } },
    }));
    const github = fakeGitHub({
      "/repos/acme/tools/pulls?state=open&per_page=100&page=1": [],
      [closed(1)]: full,
      [closed(2)]: [
        {
          number: 200,
          updated_at: "2026-11-01T00:00:00Z",
          head: { ref: "mateo/HAL-200-x", repo: { full_name: "acme/tools" } },
        },
      ],
    });
    const found = await discoverPulls(github.get, ["acme/tools"], now);
    expect(found.size).toBe(100);
    expect(github.calls.map((call) => new URL(call.url).searchParams.get("page"))).toEqual([
      "1",
      "1",
      "2",
    ]);
  });

  test("leaves out pull requests from forks, even with a branch named like ours", async () => {
    const pull = (number: number, repo: { full_name: string } | null) => ({
      number,
      updated_at: "2026-11-22T06:00:00Z",
      head: { ref: "mateo/HAL-15359-x", repo },
    });
    const github = fakeGitHub({
      "/repos/acme/tools/pulls?state=open&per_page=100&page=1": [
        pull(1, { full_name: "stranger/tools" }),
        pull(2, null),
        pull(3, { full_name: "Acme/Tools" }),
      ],
      "/repos/acme/tools/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1": [
        pull(4, { full_name: "stranger/tools" }),
      ],
    });
    const found = await discoverPulls(github.get, ["acme/tools"], now);
    expect(found.get("HAL-15359")?.map((ref) => ref.number)).toEqual([3]);
  });

  test("reads the task from a branch name", () => {
    expect(taskOfBranch("mateo/HAL-15359-pr-watcher-plugin")).toBe("HAL-15359");
    expect(taskOfBranch("priya/hal-42")).toBe("HAL-42");
    expect(taskOfBranch("release-notes-draft")).toBeUndefined();
    expect(taskOfBranch("mateo/HAL-15359x")).toBeUndefined();
    expect(taskOfBranch("HAL-15359-no-agent")).toBeUndefined();
  });
});
