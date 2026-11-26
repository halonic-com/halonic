import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { CopyComment, CopyReader } from "../pr-tools/approval-copy.ts";
import { decide } from "./decide.ts";
import {
  greenChecks,
  headOf,
  now,
  pull,
  snapshot,
  testSettings,
} from "./merge-control.test-helper.ts";
import {
  emptyShadowDay,
  recordShadow,
  type ShadowDay,
  shadowDiff,
  shadowDiffText,
} from "./shadow.ts";
import { checkCopies } from "./shadow-copies.ts";
import { passView } from "./shadow-reasons.ts";
import type { MergeSnapshot } from "./snapshot.ts";
import { emptyMergeState } from "./state.ts";

/** A Paperclip with Liam's and Julian's agents and these comments by task. */
function reader(comments: Record<string, CopyComment[]>, read: string[] = []): CopyReader {
  return {
    taskComments: async (identifier) => {
      read.push(identifier);
      return comments[identifier] ?? [];
    },
    agents: async () => [
      { id: "agent-liam", urlKey: "liam" },
      { id: "agent-julian", urlKey: "julian" },
    ],
  };
}

/** Liam's agent's copy of his approval of #n's full head. */
function liamCopy(number: number): CopyComment {
  return { authorAgentId: "agent-liam", body: `Liam: approved on head \`${headOf(number)}\`` };
}

/** One shadow pass at `minutes` after `now`, with the copy check, as the job records it. */
async function shadowPass(day: ShadowDay, facts: MergeSnapshot, copies: CopyReader, minutes = 0) {
  const at = new Date(now.getTime() + minutes * 60_000);
  const decision = decide(facts, emptyMergeState, testSettings, at);
  const view = passView(facts, decision, testSettings);
  const recorded = recordShadow(day, decision.actions, [], at, view);
  const checked = await checkCopies(facts, view, recorded.copies, copies, at);
  return { day: { ...recorded, copies: checked }, decision };
}

verifies("paperclip.merge-control-shadow-copies", () => {
  test("lists a pull request with a GitHub approval but no Paperclip copy, and refuses nothing", async () => {
    const facts = snapshot({ pulls: [pull(41), pull(42)] });
    const { day, decision } = await shadowPass(
      emptyShadowDay(now),
      facts,
      reader({ "HAL-42": [liamCopy(42)] }),
    );
    // The same actions as without the check: nothing refused.
    expect(decision.actions).toEqual(decide(facts, emptyMergeState, testSettings, now).actions);
    const diff = shadowDiff(day);
    expect(diff.needsCopy).toEqual([
      { key: "#41 on 00410aaaa", at: now.toISOString(), reason: "copy: no" },
    ]);
    expect(shadowDiffText(diff)).toContain(
      "**Needs a Paperclip copy with a full-SHA match: would refuse, nothing refused** (1)\n- 12:00 #41 on 00410aaaa (copy: no)",
    );
  });

  test("checks a pull request without a copy again after 15 minutes, and drops it once the copy is there", async () => {
    const facts = snapshot({ pulls: [pull(41)] });
    const comments: Record<string, CopyComment[]> = {};
    const read: string[] = [];
    let { day } = await shadowPass(emptyShadowDay(now), facts, reader(comments, read));
    comments["HAL-41"] = [liamCopy(41)];
    ({ day } = await shadowPass(day, facts, reader(comments, read), 10));
    expect(read).toEqual(["HAL-41"]);
    ({ day } = await shadowPass(day, facts, reader(comments, read), 20));
    expect(read).toEqual(["HAL-41", "HAL-41"]);
    expect(shadowDiff(day).needsCopy).toEqual([]);
  });

  test("says copy: unknown for a branch naming no task, and checks only pull requests whose gate passed", async () => {
    const noCiOk = pull(44, { checks: greenChecks().filter((check) => check.name !== "ci-ok") });
    const facts = snapshot({ pulls: [pull(43, { branch: "mateo/thing" }), noCiOk] });
    const read: string[] = [];
    const { day } = await shadowPass(emptyShadowDay(now), facts, reader({}, read));
    expect(read).toEqual([]);
    expect(shadowDiff(day).needsCopy).toEqual([
      { key: "#43 on 00430aaaa", at: now.toISOString(), reason: "copy: unknown" },
    ]);
  });

  test("doesn't take a 7-character copy or one by another agent as a full-SHA match", async () => {
    const short = {
      authorAgentId: "agent-liam",
      body: `Liam: approved on head \`${headOf(41).slice(0, 7)}\``,
    };
    const other = { ...liamCopy(41), authorAgentId: "agent-mateo" };
    const facts = snapshot({ pulls: [pull(41)] });
    const { day } = await shadowPass(
      emptyShadowDay(now),
      facts,
      reader({ "HAL-41": [short, other] }),
    );
    expect(shadowDiff(day).needsCopy.map(({ reason }) => reason)).toEqual(["copy: no"]);
  });
});
