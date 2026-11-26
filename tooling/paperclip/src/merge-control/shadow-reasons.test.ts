import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { decide } from "./decide.ts";
import { pullNode } from "./facts.test-helper.ts";
import { queueActionsOf } from "./facts-observed.ts";
import {
  ago,
  entry,
  greenChecks,
  headOf,
  now,
  pull,
  said,
  snapshot,
  testSettings,
} from "./merge-control.test-helper.ts";
import {
  emptyShadowDay,
  nextShadowDay,
  type ObservedAction,
  recordShadow,
  type ShadowDay,
  shadowDiff,
  shadowDiffText,
} from "./shadow.ts";
import { lateAgrees, mergerOnlyReason, passView, waitsOf } from "./shadow-reasons.ts";
import type { MergeSnapshot } from "./snapshot.ts";
import { emptyMergeState } from "./state.ts";
import { texts } from "./texts.ts";

const merger = "queue-session";

/** One shadow pass at `minutes` before `now`, as the job records it. */
function shadowPass(
  day: ShadowDay,
  facts: MergeSnapshot,
  observed: readonly ObservedAction[],
  minutes = 0,
): ShadowDay {
  const at = new Date(now.getTime() - minutes * 60_000);
  const decision = decide(facts, emptyMergeState, testSettings, at);
  return recordShadow(day, decision.actions, observed, at, passView(facts, decision, testSettings));
}

/** #n out of the queue without a `ci-ok` on its head. */
function noCiOk(number: number) {
  return pull(number, { checks: greenChecks().filter((check) => check.name !== "ci-ok") });
}

verifies("paperclip.merge-control-shadow-reasons", () => {
  test("a Merger enqueue merge control's gate passed 1 minute after counts as late, agrees", () => {
    const enqueued: ObservedAction = { kind: "enqueue", number: 40, jump: false, at: ago(1) };
    // Not ready yet on the pass before the Merger's enqueue; queued and passing on the next one.
    let day = shadowPass(emptyShadowDay(now), snapshot({ pulls: [noCiOk(40)] }), [], 5);
    day = shadowPass(day, snapshot({ pulls: [pull(40)], queue: [entry(40, 1)] }), [enqueued]);
    const diff = shadowDiff(day);
    expect(diff.mergerOnly).toEqual([]);
    expect(diff.lateAgreed).toEqual([{ key: "enqueue #40", at: ago(1), reason: lateAgrees }]);
    const text = shadowDiffText(diff);
    expect(text).toContain("0 only the Merger, 1 late, agrees.");
    expect(text).not.toContain("Only the Merger did");
    expect(text.endsWith("(1)\n- 11:59 enqueue #40")).toBe(true);
  });

  test("a Merger enqueue whose gate passed 1 minute earlier is late, agrees", () => {
    const track = { head: headOf(40), passedAt: ago(2) };
    expect(mergerOnlyReason(track, ago(1))).toBe(lateAgrees);
    expect(mergerOnlyReason(track, ago(-4))).not.toBe(lateAgrees);
  });

  test("an enqueue only merge control decided lists the Merger's note on that head", () => {
    const node = pullNode(41, {
      comments: {
        nodes: [
          { body: texts.blocked(headOf(41)), createdAt: ago(3), author: { login: merger } },
          { body: texts.liveCloud, createdAt: ago(120), author: { login: merger } },
        ],
      },
    });
    const observed = queueActionsOf(merger, [], [node]);
    expect(observed).toContainEqual({
      kind: "comment",
      number: 41,
      at: ago(3),
      note: { kind: "blocked", head: headOf(41) },
    });
    const day = shadowPass(
      emptyShadowDay(now),
      snapshot({ pulls: [pull(41), pull(43)] }),
      observed,
    );
    const text = shadowDiffText(shadowDiff(day));
    expect(text).toContain("- 12:00 enqueue #41 (Merger's note: blocked)");
    expect(text).toContain("- 12:00 enqueue #43 (no note)");
  });

  test("a Merger enqueue whose gate said ci-ok missing lists that reason", () => {
    const enqueued: ObservedAction = { kind: "enqueue", number: 42, jump: false, at: ago(2) };
    let day = shadowPass(emptyShadowDay(now), snapshot({ pulls: [noCiOk(42)] }), [], 5);
    day = shadowPass(day, snapshot({ pulls: [noCiOk(42)], queue: [entry(42, 1)] }), [enqueued]);
    const diff = shadowDiff(day);
    expect(diff.lateAgreed).toEqual([]);
    expect(diff.mergerOnly[0]?.reason).toContain("ci-ok missing on head 00420aaaa");
    expect(shadowDiffText(diff)).toContain(
      "**Only the Merger did** (1)\n- 11:58 enqueue #42 (merge control: ci-ok missing on head 00420aaaa",
    );
  });

  test("a Merger enqueue past merge control's wait rule is a real miss, not late, agrees", () => {
    const enqueued: ObservedAction = { kind: "enqueue", number: 46, jump: false, at: ago(1) };
    const h7 = headOf(46).slice(0, 7);
    const signed = [
      `Liam: approved on head \`${h7}\``,
      `Julian: security sign-off on head \`${h7}\``,
    ];
    const texts = signed.map((body) => said(body));
    const wide = pull(46, { filesTotal: 150, texts });
    let day = shadowPass(emptyShadowDay(now), snapshot({ pulls: [wide] }), [], 2);
    day = shadowPass(day, snapshot({ pulls: [wide], queue: [entry(46, 1)] }), [enqueued]);
    const diff = shadowDiff(day);
    expect(diff.lateAgreed).toEqual([]);
    expect(diff.mergerOnly[0]?.reason).toBe("touches 150 files (over 100), queue by hand");
  });

  test("the next day keeps each open pull request's track and its notes", () => {
    const observed = queueActionsOf(
      merger,
      [],
      [
        pullNode(44, {
          comments: {
            nodes: [
              { body: texts.blocked(headOf(44)), createdAt: ago(3), author: { login: merger } },
            ],
          },
        }),
      ],
    );
    const day = shadowPass(emptyShadowDay(now), snapshot({ pulls: [noCiOk(44)] }), observed);
    const next = nextShadowDay(day, new Date(now.getTime() + 24 * 60 * 60_000));
    expect(next.day).toBe("2026-11-25");
    expect(next.passes).toBe(0);
    expect(next.pulls?.["44"]?.outside?.reasons[0]).toContain("ci-ok missing");
    expect(next.notes?.[`44@${headOf(44)}`]?.kind).toBe("blocked");
  });
});

describe("waitsOf", () => {
  test("reads each candidate's wait reason, parentheses inside included", () => {
    const waits = waitsOf([
      { rule: "fill", text: "waiting=#7(board hold) #8(shares a.ts with a queued PR (hotspot))" },
    ]);
    expect(waits).toEqual(
      new Map([
        [7, "board hold"],
        [8, "shares a.ts with a queued PR (hotspot)"],
      ]),
    );
  });

  test("a note on an older head isn't the current head's", () => {
    const old = headOf(45, 1);
    const observed = queueActionsOf(
      merger,
      [],
      [
        pullNode(45, {
          comments: {
            nodes: [{ body: texts.blocked(old), createdAt: ago(3), author: { login: merger } }],
          },
        }),
      ],
    );
    expect(observed).toEqual([{ kind: "comment", number: 45, at: ago(3) }]);
  });
});
