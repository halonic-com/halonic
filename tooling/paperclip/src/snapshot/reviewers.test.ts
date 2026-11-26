import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { head, now, pull, repo } from "../fast-track/fast-track.test-helper.ts";
import {
  emptyReviewerCache,
  type ReviewerRead,
  snapshotReviewer,
  withReviewers,
} from "./reviewers.ts";
import type { Snapshot, SnapshotPull } from "./shape.ts";

const watched = "acme/tools";

function snapshotOf(...pulls: SnapshotPull[]): Snapshot {
  return { version: 1, takenAt: now.toISOString(), closedWindowDays: 3, repos: [repo(pulls)] };
}

/** A GitHub that names `nora` for every pull request, counting its reads. */
function noraEverywhere() {
  const reads: number[] = [];
  const read: ReviewerRead = async (_, number) => {
    reads.push(number);
    return { head, reviewer: "nora" };
  };
  return { reads, read };
}

function reviewersOf(snapshot: Snapshot): (string | undefined)[] {
  return snapshot.repos.flatMap((each) => each.pulls.map((listed) => listed.open?.reviewer));
}

verifies("paperclip.snapshot-reviewer", () => {
  describe("each open pull request's reviewer in the snapshot (HAL-19653)", () => {
    test("names the shared answer's reviewer, and keeps it for the head", async () => {
      const github = noraEverywhere();
      const first = await withReviewers(snapshotOf(pull(1)), {
        repo: watched,
        before: emptyReviewerCache,
        read: github.read,
        log: () => {},
      });
      expect(reviewersOf(first.snapshot)).toEqual(["Nora"]);
      const second = await withReviewers(snapshotOf(pull(1)), {
        repo: watched,
        before: first.cache,
        read: github.read,
        log: () => {},
      });
      expect(reviewersOf(second.snapshot)).toEqual(["Nora"]);
      expect(github.reads).toEqual([1]);
    });

    test("reads a pull request again after a push", async () => {
      const github = noraEverywhere();
      const before = {
        version: 1,
        pulls: { [`${watched}#1`]: { head: "old", reviewer: "Liam" } },
      } as const;
      const result = await withReviewers(snapshotOf(pull(1)), {
        repo: watched,
        before,
        read: github.read,
        log: () => {},
      });
      expect(reviewersOf(result.snapshot)).toEqual(["Nora"]);
      expect(github.reads).toEqual([1]);
    });

    test("uses the author rule for a draft, a fork, another repository and a failed read", async () => {
      const github = noraEverywhere();
      const lines: string[] = [];
      const failing: ReviewerRead = async (_, number) => {
        if (number === 4) {
          throw new Error("GitHub said 502");
        }
        return github.read(watched, number);
      };
      const result = await withReviewers(
        snapshotOf(
          pull(1, { draft: true }),
          pull(2, {}, { headRepo: "someone/tools" }),
          pull(3, { draft: true }, { branch: "liam/HAL-3-thing" }),
          pull(4),
        ),
        {
          repo: watched,
          before: emptyReviewerCache,
          read: failing,
          log: (line) => lines.push(line),
        },
      );
      expect(reviewersOf(result.snapshot)).toEqual(["Liam", "Liam", "Julian", "Liam"]);
      expect(github.reads).toEqual([]);
      expect(lines).toEqual([`Reviewer of ${watched}#4: couldn't read it: GitHub said 502`]);
      expect(result.cache.pulls).toEqual({});

      const elsewhere = await withReviewers(snapshotOf(pull(5)), {
        repo: "acme/other",
        before: emptyReviewerCache,
        read: github.read,
        log: () => {},
      });
      expect(reviewersOf(elsewhere.snapshot)).toEqual(["Liam"]);
    });

    test("a snapshot saved before the field gets the author rule's reviewer", () => {
      expect(snapshotReviewer(pull(1))).toBe("Liam");
      expect(snapshotReviewer(pull(1, {}, { branch: "liam/HAL-1-thing" }))).toBe("Julian");
      expect(snapshotReviewer(pull(1, { reviewer: "Nora" }))).toBe("Nora");
    });
  });
});
