import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import { discoverPulls, taskOfBranch } from "./discover.ts";
import { recording } from "./fakes.test-helper.ts";

const now = new Date("2026-11-22T07:20:00Z");

/** A pull request as the REST lists in the recordings give it. */
interface Listed {
  readonly number: number;
  readonly updated_at: string;
  readonly head: { readonly ref: string; readonly repo: { readonly full_name: string } | null };
}

function pullOf(listed: Listed, open: boolean): SnapshotPull {
  return {
    number: listed.number,
    url: `https://github.com/acme/tools/pull/${listed.number}`,
    state: open ? "open" : "closed",
    branch: listed.head.ref,
    headRepo: listed.head.repo?.full_name ?? null,
    base: "main",
    head: "0000000",
    updatedAt: listed.updated_at,
    mergedAt: null,
    mergeCommit: null,
    open: open
      ? {
          draft: false,
          mergeable: "yes",
          ciOk: "success",
          draftCiOk: "missing",
          inQueue: false,
          labels: [],
          finding: null,
          approvals: [],
        }
      : null,
  };
}

/** A snapshot of one repository taken `now`, from its open and closed lists. */
function snapshotOf(repo: string, open: readonly Listed[], closed: readonly Listed[]): Snapshot {
  return {
    version: 1,
    takenAt: now.toISOString(),
    closedWindowDays: 3,
    repos: [
      {
        repo,
        defaultBranch: "main",
        queue: [],
        pulls: [
          ...open.map((each) => pullOf(each, true)),
          ...closed.map((each) => pullOf(each, false)),
        ],
      },
    ],
  };
}

/** The recorded lists of 22 Nov as a snapshot. */
function recorded(): Snapshot {
  const lists = recording("pull-lists");
  const listed = (state: string) =>
    Object.entries(lists).find(([path]) => path.includes(`state=${state}`))?.[1] as Listed[];
  return snapshotOf("halonic-com/halonic", listed("open"), listed("closed"));
}

verifies("paperclip.pr-watcher-plugin", () => {
  test("finds open and recently closed pull requests by the task their branch names", () => {
    const found = discoverPulls(recorded());
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

  test("lists a pull request that closed between the two reads once", () => {
    const found = discoverPulls(recorded());
    expect(found.get("HAL-15905")?.map((ref) => ref.number)).toEqual([4957]);
  });

  test("leaves out a pull request closed more than 3 days ago", () => {
    const found = discoverPulls(recorded());
    expect(found.has("HAL-1375")).toBe(false);
  });

  test("leaves out pull requests from forks, even with a branch named like ours", async () => {
    const pull = (number: number, repo: { full_name: string } | null) => ({
      number,
      updated_at: "2026-11-22T06:00:00Z",
      head: { ref: "mateo/HAL-15359-x", repo },
    });
    const found = discoverPulls(
      snapshotOf(
        "acme/tools",
        [
          pull(1, { full_name: "stranger/tools" }),
          pull(2, null),
          pull(3, { full_name: "Acme/Tools" }),
        ],
        [pull(4, { full_name: "stranger/tools" })],
      ),
    );
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
