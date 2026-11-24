import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { at, pull, snapshot } from "../board-check/merge-speed.test-helper.ts";
import {
  type AgentMergeRecord,
  agentMergeCounts,
  readAgentMergeRecord,
  trackAgentMerges,
} from "./agent-merges.ts";
import type { Snapshot } from "./shape.ts";

const takenAt = at("12:00");

/** `days` days before the 12:00 snapshot, ISO. */
const daysBefore = (days: number) =>
  new Date(Date.parse(takenAt) - days * 24 * 60 * 60_000).toISOString();

/** A snapshot keeping 3 days of closed pull requests. */
function threeDays(...pulls: ReturnType<typeof pull>[]): Snapshot {
  return { ...snapshot(takenAt, [], pulls), closedWindowDays: 3 };
}

verifies("paperclip.agent-merge-counts", () => {
  test("keeps only agents' merges into the default branch, counting from the snapshot's window", () => {
    const record = trackAgentMerges(
      undefined,
      threeDays(
        pull(11, at("09:00")),
        { ...pull(12, at("09:10")), headRepo: "stranger/app" },
        { ...pull(13, at("09:20")), branch: "boss/try-a-thing" },
        { ...pull(14, at("09:30")), base: "release" },
        pull(15),
      ),
    );
    expect(record).toEqual({
      version: 1,
      countingSince: daysBefore(3),
      merges: [{ pull: "acme/app#11", agent: "mateo", at: at("09:00") }],
    });
  });

  test("keeps a merge once when later snapshots still list it", () => {
    const first = trackAgentMerges(undefined, threeDays(pull(11, at("09:00"))));
    const second = trackAgentMerges(first, threeDays(pull(11, at("09:00")), pull(16, at("11:00"))));
    expect(second.merges.map((merge) => merge.pull)).toEqual(["acme/app#11", "acme/app#16"]);
    expect(second.countingSince).toBe(first.countingSince);
  });

  test("counts 7 and 30 days per agent and drops merges older than 30 days", () => {
    const record: AgentMergeRecord = {
      version: 1,
      countingSince: daysBefore(40),
      merges: [
        { pull: "acme/app#1", agent: "mateo", at: daysBefore(31) },
        { pull: "acme/app#2", agent: "mateo", at: daysBefore(10) },
        { pull: "acme/app#3", agent: "liam", at: daysBefore(20) },
        { pull: "acme/app#4", agent: "mateo", at: daysBefore(2) },
      ],
    };
    expect(agentMergeCounts(record, new Date(takenAt))).toEqual({
      countingSince: daysBefore(40),
      agents: [
        { agent: "mateo", days7: 1, days30: 2 },
        { agent: "liam", days7: 0, days30: 1 },
      ],
    });
    const next = trackAgentMerges(record, threeDays());
    expect(next.merges.map((merge) => merge.pull)).toEqual([
      "acme/app#3",
      "acme/app#2",
      "acme/app#4",
    ]);
  });

  test("reads a saved record back, skipping malformed entries", () => {
    const saved = {
      version: 1,
      countingSince: daysBefore(3),
      merges: [
        { pull: "acme/app#11", agent: "mateo", at: at("09:00") },
        { pull: "acme/app#12", agent: "x".repeat(300), at: at("09:00") },
        { pull: "acme/app#13", agent: "mateo", at: "9".repeat(300) },
        null,
      ],
    };
    expect(readAgentMergeRecord(saved)?.merges).toEqual([
      { pull: "acme/app#11", agent: "mateo", at: at("09:00") },
    ]);
    expect(readAgentMergeRecord({ ...saved, version: 2 })).toBeUndefined();
    expect(readAgentMergeRecord(null)).toBeUndefined();
  });
});
