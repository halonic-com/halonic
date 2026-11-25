import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { decide } from "./decide.ts";
import {
  actionsOf,
  enqueued,
  logText,
  pull,
  snapshot,
  testSettings,
} from "./merge-control.test-helper.ts";
import type { FailedJob, GroupRun, MergeSnapshot } from "./snapshot.ts";
import { emptyMergeState, type MergeState } from "./state.ts";

/**
 * The #5969 replay (HAL-18340). The case is plain JSON, without plugin
 * types, so the Merger's own tests load the same file from `main` and
 * prove the same rule.
 */
interface Pass {
  readonly at: string;
  readonly groupRuns: readonly number[];
  readonly mainPush: string;
  readonly freezeEnded: boolean;
  readonly expect: {
    readonly mainBroken: boolean;
    readonly held: boolean;
    readonly enqueue: boolean;
    readonly commentedOn: readonly number[];
  };
}

interface Case {
  readonly pull: { readonly number: number; readonly head: string; readonly files: string[] };
  readonly groupRuns: readonly (Omit<GroupRun, "failedJobs"> & {
    readonly failedJobs: readonly Omit<FailedJob, "url">[];
  })[];
  readonly passes: readonly Pass[];
}

const fixture: Case = JSON.parse(
  readFileSync(new URL("./fixtures/same-head-5969.json", import.meta.url), "utf8"),
);

function factsOf(pass: Pass): MergeSnapshot {
  const { number, head, files } = fixture.pull;
  const runs = fixture.groupRuns.filter((run) => pass.groupRuns.includes(run.id));
  return snapshot({
    pulls: [pull(number, { head, files, filesTotal: files.length })],
    groupRuns: runs.map((run) => ({
      ...run,
      failedJobs: run.failedJobs.map((job) => ({ ...job, url: run.url })),
    })),
    mainRuns: [
      {
        id: 1,
        headSha: "c766ccd2bbde7414fc2de123cb5efd2c1a295bec",
        status: "completed",
        conclusion: pass.mainPush,
        createdAt: "2026-11-25T07:00:00Z",
        branch: "main",
      },
    ],
  });
}

/** The state the next pass starts from: the board's freeze lifted when the case says so. */
function carried(state: MergeState, pass: Pass): MergeState {
  return pass.freezeEnded
    ? { ...state, mainBroken: null, board: { ...state.board, mainRed: null } }
    : state;
}

verifies("paperclip.merge-control-culprit-hold", () => {
  test("#5969: a head whose group failed is held even when main is blamed, and not queued again", () => {
    const { number, head } = fixture.pull;
    let state: MergeState = emptyMergeState;
    for (const pass of fixture.passes) {
      const decision = decide(factsOf(pass), carried(state, pass), testSettings, new Date(pass.at));
      expect(decision.state.mainBroken !== null).toBe(pass.expect.mainBroken);
      expect(decision.state.failedHeads[String(number)] === head).toBe(pass.expect.held);
      expect(enqueued(decision).includes(number)).toBe(pass.expect.enqueue);
      expect(actionsOf(decision, "comment").map((each) => each.number)).toEqual(
        pass.expect.commentedOn,
      );
      if (pass.freezeEnded) {
        expect(logText(decision)).toContain(
          `#${number}(failed in a merge group on this head; waits for a new head)`,
        );
      }
      state = decision.state;
    }
  });
});
