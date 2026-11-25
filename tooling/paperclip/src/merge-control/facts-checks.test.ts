import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkRun, pullNode } from "./facts.test-helper.ts";
import { readMergeFacts } from "./facts.ts";
import { checkPagesMax, withAllChecks } from "./facts-checks.ts";
import { recorded } from "./facts-recorded.test-helper.ts";
import { gateRow } from "./gate.ts";
import { ago, enqueued, now, pass, testSettings } from "./merge-control.test-helper.ts";

/** #120's head: 100 green check runs on the first page, `ci-ok` only on the second. */
const firstPage = [
  checkRun("Lint", "CI", { run: 9120, job: 12002 }),
  checkRun("guard", "Guard notes", { run: 9220 }),
  checkRun("label", "Built-on label", { run: 9320 }),
  ...Array.from({ length: 97 }, (_, index) =>
    checkRun(`Tests (${index + 1})`, "CI", { run: 9120, job: 12100 + index }),
  ),
];
const secondPage = [checkRun("ci-ok", "CI", { run: 9120, job: 12001 })];

const bigPull = pullNode(120, {
  commits: {
    nodes: [
      {
        commit: {
          committedDate: ago(90),
          statusCheckRollup: {
            contexts: { pageInfo: { hasNextPage: true, endCursor: "after-100" }, nodes: firstPage },
          },
        },
      },
    ],
  },
});

/** A reader on the recorded answers, with #120 the only open pull request. */
function reader(answerSecondPage: boolean) {
  const asked: Record<string, unknown>[] = [];
  const graphql = (query: string, variables: Record<string, unknown>) => {
    if (query.includes("MergeFactsPulls")) {
      return {
        rateLimit: { cost: 1, remaining: 4990 },
        repository: {
          defaultBranchRef: { name: "main", target: { oid: "main-sha" } },
          mergeQueue: { entries: { nodes: [] } },
          pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [bigPull] },
        },
      };
    }
    if (!query.includes("MergeFactsChecks")) {
      return undefined;
    }
    asked.push(variables);
    const rollup = {
      contexts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: secondPage },
    };
    return { repository: { object: answerSecondPage ? { statusCheckRollup: rollup } : null } };
  };
  // No merge-group runs: nothing but #120's own checks decides.
  return { ...recorded({ graphql, groups: [] }), asked };
}

verifies("paperclip.merge-control-all-checks", () => {
  test("a head's checks past the first 100 are read, so its ci-ok counts and it is enqueued", async () => {
    const { deps, asked, sent, lines } = reader(true);
    const { snapshot } = await readMergeFacts(deps, now);
    expect(asked).toEqual([
      expect.objectContaining({ oid: bigPull.headRefOid, after: "after-100" }),
    ]);
    const [pull] = snapshot.pulls;
    expect(pull?.checks).toHaveLength(101);
    expect(pull?.checks.find((check) => check.name === "ci-ok")?.conclusion).toBe("success");
    expect(enqueued(pass(snapshot))).toEqual([120]);
    const queries = sent.filter((request) => request.url.endsWith("/graphql")).length;
    expect(lines.find((line) => line.startsWith("GitHub requests"))).toContain(
      `${queries} GraphQL queries`,
    );
  });

  test("when the second page isn't answered, the pass goes on and doesn't enqueue it", async () => {
    const { deps, lines } = reader(false);
    const { snapshot } = await readMergeFacts(deps, now);
    const [pull] = snapshot.pulls;
    expect(pull?.checks).toHaveLength(100);
    expect(enqueued(pass(snapshot))).toEqual([]);
    expect(pull && gateRow(snapshot, pull, testSettings).reasons.join("\n")).toContain("ci-ok");
    expect(lines).toContain("#120: check runs after the first 100 not read: GitHub gave no rollup");
  });

  test("a failed page read is logged, not thrown", async () => {
    const { deps, lines } = reader(true);
    const failing = {
      ...deps,
      query: async (document: string, variables: Record<string, unknown>) => {
        if (document.includes("MergeFactsChecks")) {
          throw new Error("GitHub GraphQL answered 502.");
        }
        return await deps.query(document, variables);
      },
    };
    const { snapshot } = await readMergeFacts(failing, now);
    expect(enqueued(pass(snapshot))).toEqual([]);
    expect(lines).toContain(
      "#120: check runs after the first 100 not read: GitHub GraphQL answered 502.",
    );
  });

  test("reads at most four more pages, 500 check runs, and says where it stopped", async () => {
    const lines: string[] = [];
    let pages = 0;
    const endless = {
      contexts: { pageInfo: { hasNextPage: true, endCursor: "more" }, nodes: secondPage },
    };
    const query = async () => {
      pages += 1;
      return { repository: { object: { statusCheckRollup: endless } } };
    };
    const reader = {
      query,
      owner: "halonic-com",
      name: "halonic",
      log: (line: string) => lines.push(line),
    };
    const node = await withAllChecks(reader, bigPull);
    expect(pages).toBe(checkPagesMax);
    expect(node.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes).toHaveLength(104);
    expect(lines).toEqual(["#120: check runs after the first 104 not read"]);
  });
});
