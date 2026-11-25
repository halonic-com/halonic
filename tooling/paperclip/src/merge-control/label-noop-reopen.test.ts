import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import { act, writesOf } from "./act.ts";
import { labelNoopCheck } from "./checks.ts";
import {
  actionsOf,
  ago,
  check,
  entry,
  greenChecks,
  headOf,
  logText,
  pass,
  pull,
  said,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import type { GatePull } from "./snapshot.ts";
import type { LabelNoopReopen } from "./state.ts";
import { texts } from "./texts.ts";
import type { QueueWrite } from "./write-client.ts";

/** The label-noop self-fix (HAL-18470), as the live Merger does it since 25 Nov 12:02 UTC. */

const repo = "halonic-com/halonic";

/** An approved pull request whose head shows a label run after its green `ci-ok`. */
function noop(number: number, changes: Partial<GatePull> = {}): GatePull {
  return pull(number, {
    checks: [...greenChecks(), check(labelNoopCheck, "CI", { runCreatedAt: ago(20) })],
    ...changes,
  });
}

function reopened(...pulls: GatePull[]) {
  return (state = stateWith()) => {
    const decision = pass(snapshot({ pulls }), state);
    return { decision, numbers: actionsOf(decision, "reopen").map((each) => each.number) };
  };
}

function done(number: number, ...reopens: LabelNoopReopen[]) {
  return stateWith({ labelNoopReopened: { [String(number)]: reopens } });
}

verifies("paperclip.merge-control-label-noop-reopen", () => {
  test("an approved label-noop head gets one comment, a close and a reopen, once", () => {
    const first = reopened(noop(1))();
    expect(actionsOf(first.decision, "reopen")).toEqual([
      {
        kind: "reopen",
        number: 1,
        pullId: "PR_1",
        head: headOf(1),
        comment: texts.labelNoopReopen(headOf(1)),
      },
    ]);
    expect(logText(first.decision)).toContain("labelNoopReopened=#1");
    const [action] = actionsOf(first.decision, "reopen");
    expect(action && writesOf(action, repo).map((write) => write.kind)).toEqual([
      "comment",
      "close",
      "reopen",
    ]);
    expect(texts.labelNoopReopen(headOf(1))).not.toContain("@");

    const again = reopened(noop(1))(first.decision.state);
    expect(again.numbers).toEqual([]);
    expect(logText(again.decision)).not.toContain("LABEL_NOOP_LOOP");
  });

  test("never on an unapproved, queued, draft or green pull request", () => {
    const unapproved = noop(1, { texts: [said("Looks fine to me")] });
    const stale = noop(2, { texts: [said("Liam: approved on head `0000000`")] });
    const draft = noop(3, { draft: true });
    const green = pull(4);
    expect(reopened(unapproved, stale, draft, green)().numbers).toEqual([]);
    const queued = pass(snapshot({ pulls: [noop(5)], queue: [entry(5, 1)] }));
    expect(actionsOf(queued, "reopen")).toEqual([]);
  });

  test("a second head within a day stops it and logs LABEL_NOOP_LOOP; after a day it reopens", () => {
    const second = noop(1, {
      head: headOf(1, 1),
      texts: [said(`Liam: approved on head \`${headOf(1, 1).slice(0, 7)}\``)],
    });
    const recent = reopened(second)(done(1, { head: headOf(1), at: ago(23 * 60) }));
    expect(recent.numbers).toEqual([]);
    expect(logText(recent.decision)).toContain("LABEL_NOOP_LOOP #1");

    const old = reopened(second)(done(1, { head: headOf(1), at: ago(25 * 60) }));
    expect(old.numbers).toEqual([1]);
    expect(old.decision.state.labelNoopReopened["1"]?.map((each) => each.head)).toEqual([
      headOf(1),
      headOf(1, 1),
    ]);
  });

  test("reopens older than 2 days are pruned", () => {
    const state = stateWith({
      labelNoopReopened: {
        "7": [{ head: headOf(7), at: ago(49 * 60) }],
        "8": [
          { head: headOf(8), at: ago(49 * 60) },
          { head: headOf(8, 1), at: ago(60) },
        ],
      },
    });
    expect(pass(snapshot(), state).state.labelNoopReopened).toEqual({
      "8": [{ head: headOf(8, 1), at: ago(60) }],
    });
  });

  test("a failed reopen is tried once more, and the close comes after the comment", async () => {
    const sent: QueueWrite["kind"][] = [];
    let failures = 1;
    const send = vi.fn(async (write: QueueWrite) => {
      sent.push(write.kind);
      if (write.kind === "reopen" && failures-- > 0) {
        throw new Error("answered 502");
      }
    });
    const actions = actionsOf(reopened(noop(1))().decision, "reopen");
    const results = await act(actions, { repo, client: { send } });
    expect(sent).toEqual(["comment", "close", "reopen", "reopen"]);
    expect(results).toEqual([{ action: "reopen #1", outcome: "sent" }]);
  });
});
