import type { GitHubQuery } from "../snapshot/graphql.ts";

/**
 * What the live Merger acts on, per open pull request (HAL-19234): its head,
 * its base, GitHub's review decision, the check rollup on its head and its
 * labels. A pull request that appears or disappears from the open list was
 * opened (or reopened) or closed. A change in `updatedAt` alone, such as a
 * comment or an edited title, changes none of these, so it wakes nobody.
 */

/** One open pull request's fields the Merger acts on. */
export interface PullPrint {
  readonly head: string;
  readonly base: string;
  readonly review: string;
  readonly checks: string;
  /** Sorted and comma-joined, so the order GitHub lists them in doesn't count. */
  readonly labels: string;
}

/** The open pull requests' prints, by number. */
export type Prints = ReadonlyMap<number, PullPrint>;

const printFields = ["head", "base", "review", "checks", "labels"] as const;

/** One query costs one point; 100 is the most one page may hold. */
const printsQuery = `query MergerWakePrints($owner: String!, $name: String!, $after: String) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        headRefOid
        baseRefName
        reviewDecision
        labels(first: 50) { nodes { name } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

/** More open pull requests than this is a read gone wrong, not a busy day. */
export const maxPages = 5;

interface PullNode {
  readonly number?: unknown;
  readonly headRefOid?: unknown;
  readonly baseRefName?: unknown;
  readonly reviewDecision?: unknown;
  readonly labels?: { readonly nodes?: readonly ({ readonly name?: unknown } | null)[] } | null;
  readonly commits?: {
    readonly nodes?: readonly ({
      readonly commit?: { readonly statusCheckRollup?: { readonly state?: unknown } | null };
    } | null)[];
  } | null;
}

interface PrintsAnswer {
  readonly repository?: {
    readonly pullRequests?: {
      readonly pageInfo?: { readonly hasNextPage?: unknown; readonly endCursor?: unknown };
      readonly nodes?: readonly (PullNode | null)[];
    };
  } | null;
}

const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

/** A node's print, or undefined for a node without a number. */
function printOf(node: PullNode | null): [number, PullPrint] | undefined {
  if (node === null || typeof node.number !== "number") {
    return undefined;
  }
  const labels = (node.labels?.nodes ?? [])
    .flatMap((label) => (typeof label?.name === "string" ? [label.name] : []))
    .sort();
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  return [
    node.number,
    {
      head: text(node.headRefOid, ""),
      base: text(node.baseRefName, ""),
      review: text(node.reviewDecision, "none"),
      checks: text(rollup?.state, "none"),
      labels: labels.join(","),
    },
  ];
}

/** Reads the prints of every open pull request in `repo` (owner/name). */
export async function readPrints(query: GitHubQuery, repo: string): Promise<Prints> {
  const [owner, name] = repo.split("/");
  const prints = new Map<number, PullPrint>();
  let after: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const answer = (await query(printsQuery, { owner, name, after })) as PrintsAnswer;
    const pulls = answer.repository?.pullRequests;
    for (const node of pulls?.nodes ?? []) {
      const entry = printOf(node);
      if (entry !== undefined) {
        prints.set(...entry);
      }
    }
    if (pulls?.pageInfo?.hasNextPage !== true || typeof pulls.pageInfo.endCursor !== "string") {
      return prints;
    }
    after = pulls.pageInfo.endCursor;
  }
  throw new Error(`more than ${maxPages * 100} open pull requests in ${repo}.`);
}

/** What changed between two reads, one line per pull request, such as `#6085 head, labels`. */
export function changesBetween(before: Prints, after: Prints): string[] {
  const changes: string[] = [];
  for (const [number, now] of after) {
    const was = before.get(number);
    if (was === undefined) {
      changes.push(`#${number} opened`);
      continue;
    }
    const changed = printFields.filter((field) => was[field] !== now[field]);
    if (changed.length > 0) {
      changes.push(`#${number} ${changed.join(", ")}`);
    }
  }
  for (const number of before.keys()) {
    if (!after.has(number)) {
      changes.push(`#${number} closed`);
    }
  }
  return changes;
}
