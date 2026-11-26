import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  actionsOf,
  enqueued,
  entry,
  pass,
  pull,
  snapshot,
  testSettings,
} from "../merge-control/merge-control.test-helper.ts";
import { emptyMergeState } from "../merge-control/state.ts";
import { type VerdictGateApi, withRecordedVerdicts } from "./verdict-gate.ts";

const flagOn = { ...testSettings, verdictGate: true };
const settings = { repo: "halonic-com/halonic", teamLogin: "halonic-dev" };

/** A plugin context with no records and no comments, whose agents read fails or answers. */
function context(agentsFail: boolean): VerdictGateApi {
  const api = {
    issues: {
      get: async (identifier: string) => ({ id: `issue-${identifier}` }),
      listComments: async () => [],
    },
    agents: {
      list: async () => {
        if (agentsFail) {
          throw new Error("Paperclip answered 503");
        }
        return [{ id: "agent-mateo", urlKey: "mateo" }];
      },
    },
    entities: { upsert: async () => ({}), list: async () => [] },
  };
  return api as unknown as VerdictGateApi;
}

/** #1 queued and #3 ready, both approved by a line on GitHub only. */
const facts = snapshot({ pulls: [pull(1), pull(3)], queue: [entry(1, 1)] });

verifies("paperclip.verdicts-gate", () => {
  describe("the merge gate with the board's flag on, when a read fails", () => {
    test("a failed agents read removes no queued pull request and adds none", async () => {
      const read = await withRecordedVerdicts(context(true), "company-1", facts, settings);
      expect(read.recorded?.["1"]?.unread).toBe(true);
      const decision = pass(read, emptyMergeState, flagOn);
      expect(actionsOf(decision, "dequeue")).toEqual([]);
      expect(enqueued(decision)).toEqual([]);
    });

    test("records read with no approval still take a queued pull request out", async () => {
      const read = await withRecordedVerdicts(context(false), "company-1", facts, settings);
      expect(read.recorded?.["1"]?.unread).toBeUndefined();
      const decision = pass(read, emptyMergeState, flagOn);
      expect(actionsOf(decision, "dequeue").map((each) => [each.number, each.reason])).toEqual([
        [1, "no-signed-approval"],
      ]);
      expect(enqueued(decision)).toEqual([]);
    });
  });
});
