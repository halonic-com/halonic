import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { decide } from "./decide.ts";
import { graphqlAnswer, repo } from "./facts.test-helper.ts";
import { readMergeFacts } from "./facts.ts";
import type { PullNode } from "./facts-query.ts";
import { recorded } from "./facts-recorded.test-helper.ts";
import { headOf, now } from "./merge-control.test-helper.ts";
import { defaultSettings, emptyMergeState } from "./state.ts";

/** #101's approved head before its rebase. */
const old = "0dd1010aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** The pulls page, with #101 approved by Liam on `old` instead of its head. */
function approvedOnOld(query: string): unknown {
  if (!query.includes("MergeFactsPulls")) {
    return undefined;
  }
  const answer = graphqlAnswer(query) as {
    repository: { pullRequests: { nodes: PullNode[] } };
  };
  for (const pull of answer.repository.pullRequests.nodes) {
    if (pull.number === 101) {
      Object.assign(pull, {
        comments: {
          nodes: [
            {
              body: `Liam: approved on head \`${old.slice(0, 7)}\``,
              createdAt: new Date(now.getTime() - 120 * 60_000).toISOString(),
              author: { login: "halonic-dev" },
            },
          ],
        },
      });
    }
  }
  return answer;
}

/** A compare that changes one line of the file at the given line number. */
function compare(line: number, added = "export const line = 2;") {
  return {
    files: [
      {
        filename: "packages/core/thing-101/src/a.ts",
        status: "modified",
        patch: `@@ -${line},1 +${line},1 @@\n-export const line = 1;\n+${added}`,
      },
    ],
  };
}

const compareOld = `/repos/${repo}/compare/main...${old.slice(0, 7)}`;
const compareHead = `/repos/${repo}/compare/main...${headOf(101)}`;

async function passWith(rest: Record<string, unknown>) {
  const { deps, lines } = recorded({ rest, graphql: approvedOnOld });
  const { snapshot } = await readMergeFacts(deps, now);
  const decision = decide(snapshot, emptyMergeState, defaultSettings, now);
  const enqueued = decision.actions.some(
    (action) => action.kind === "enqueue" && "number" in action && action.number === 101,
  );
  const notes = decision.actions.flatMap((action) =>
    action.kind === "comment" && "body" in action ? [action.body] : [],
  );
  return { snapshot, enqueued, notes, lines };
}

verifies("paperclip.merge-control-carry-over", () => {
  test("a rebase-only push after Liam's approval is queued, with the carry-over note", async () => {
    const { snapshot, enqueued, notes } = await passWith({
      [compareOld]: compare(10),
      [compareHead]: compare(40),
    });
    expect(snapshot.patchIds[old.slice(0, 7)]).toEqual(expect.any(String));
    expect(snapshot.patchIds[headOf(101)]).toBe(snapshot.patchIds[old.slice(0, 7)]);
    expect(enqueued).toBe(true);
    expect(notes).toContain(
      `Approval of ${old.slice(0, 7)} carried to ${headOf(101).slice(0, 9)}: rebase only, identical diff.`,
    );
  });

  test("a changed line since the approval isn't queued", async () => {
    const { enqueued } = await passWith({
      [compareOld]: compare(10),
      [compareHead]: compare(40, "export const line = 3;"),
    });
    expect(enqueued).toBe(false);
  });

  test("a compare GitHub fails isn't queued, and the failure is logged", async () => {
    // No recorded answer for the old head: GitHub answers 404.
    const { snapshot, enqueued, lines } = await passWith({ [compareHead]: compare(40) });
    expect(snapshot.patchIds[old.slice(0, 7)]).toBeNull();
    expect(enqueued).toBe(false);
    expect(lines.some((line) => line.startsWith("patch-id of 0dd1010 unknown"))).toBe(true);
  });

  test("a pull request approved on its own head reads no compare", async () => {
    const { deps, sent } = recorded();
    const { snapshot } = await readMergeFacts(deps, now);
    expect(snapshot.patchIds[headOf(101)]).toBeNull();
    expect(sent.some((request) => request.url.includes(`/compare/main...${headOf(101)}`))).toBe(
      false,
    );
  });
});
