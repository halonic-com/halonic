import type { GitHubQuery } from "../snapshot/graphql.ts";
import {
  type ChecksPage,
  type FactsRollup,
  factsChecksQuery,
  type PullNode,
  type RollupRun,
} from "./facts-query.ts";

/**
 * Reads the rest of a head's check runs when its rollup has more than one
 * page (HAL-18344). #5999 and #6000 had 106 and 102 check runs, `ci-ok`
 * wasn't among the first 100, and the gate saw it missing. Each follow-up
 * page is one more GraphQL query, so the pass's request line counts it.
 */

/** Follow-up pages per head at most: 500 check runs in all. */
export const checkPagesMax = 4;

/** Where the reader sends the follow-up pages. */
export interface ChecksReader {
  readonly query: GitHubQuery;
  readonly owner: string;
  readonly name: string;
  readonly log: (line: string) => void;
}

function rollupOf(node: PullNode): FactsRollup | null {
  return node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
}

function withRollup(node: PullNode, rollup: FactsRollup): PullNode {
  const [last] = node.commits.nodes;
  if (last === undefined) {
    return node;
  }
  return {
    ...node,
    commits: { nodes: [{ commit: { ...last.commit, statusCheckRollup: rollup } }] },
  };
}

async function nextPage(
  reader: ChecksReader,
  oid: string,
  after: string,
): Promise<FactsRollup | null> {
  const page = (await reader.query(factsChecksQuery, {
    owner: reader.owner,
    name: reader.name,
    oid,
    after,
  })) as ChecksPage | null;
  return page?.repository?.object?.statusCheckRollup ?? null;
}

/**
 * The pull request with every check run of its head. A page that can't be
 * read leaves the runs read so far, still marked as cut off, and logs why:
 * the gate then sees `ci-ok` missing and waits, which is safe, rather than
 * the whole pass failing over one pull request.
 */
export async function withAllChecks(reader: ChecksReader, node: PullNode): Promise<PullNode> {
  const first = rollupOf(node);
  if (first === null) {
    return node;
  }
  const runs: RollupRun[] = [...first.contexts.nodes];
  let pageInfo = first.contexts.pageInfo;
  for (let page = 0; pageInfo?.hasNextPage === true; page += 1) {
    const after = pageInfo.endCursor ?? null;
    if (page === checkPagesMax || after === null) {
      reader.log(`#${node.number}: check runs after the first ${runs.length} not read`);
      break;
    }
    const why = await nextPage(reader, node.headRefOid, after).then(
      (rollup) => {
        if (rollup === null) {
          return "GitHub gave no rollup";
        }
        runs.push(...rollup.contexts.nodes);
        pageInfo = rollup.contexts.pageInfo;
        return null;
      },
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    if (why !== null) {
      reader.log(`#${node.number}: check runs after the first ${runs.length} not read: ${why}`);
      break;
    }
  }
  return withRollup(node, { contexts: { nodes: runs, ...(pageInfo ? { pageInfo } : {}) } });
}
