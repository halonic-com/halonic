/**
 * The one GraphQL query behind `github.merge-queue`, and the shape of its
 * answer. Ported from `tooling/paperclip`'s `snapshot/queries.ts`. The merge
 * queue exists only in GitHub's GraphQL API. Checks are read as each
 * commit's rollup: a job waiting on another job has no check run yet, so a
 * queued run waits for a runner.
 */

const checkRuns = `contexts(first: 100) {
  pageInfo { hasNextPage }
  nodes { ... on CheckRun { name status conclusion startedAt } }
}`;

/** The queue's entries with each group commit's checks, and the open pull requests with `$label`. */
export const mergeQueueQuery = `query MergeQueue($owner: String!, $name: String!, $label: String!) {
  repository(owner: $owner, name: $name) {
    mergeQueue {
      entries(first: 100) {
        nodes {
          position state enqueuedAt estimatedTimeToMerge
          enqueuer { login }
          pullRequest { number url headRefName headRepository { nameWithOwner } }
          headCommit { oid statusCheckRollup { ${checkRuns} } }
        }
      }
    }
    pullRequests(states: OPEN, labels: [$label], first: 50) {
      nodes {
        number url isDraft isInMergeQueue headRefName headRepository { nameWithOwner }
        timelineItems(itemTypes: [LABELED_EVENT], last: 20) {
          nodes { ... on LabeledEvent { createdAt label { name } actor { login } } }
        }
        commits(last: 1) { nodes { commit { oid statusCheckRollup { ${checkRuns} } } } }
      }
    }
  }
}`;

/** A commit's checks, the first 100 of them. */
export interface Rollup {
  readonly contexts: {
    readonly pageInfo: { readonly hasNextPage: boolean };
    readonly nodes: readonly {
      readonly name?: string;
      readonly status?: string;
      readonly conclusion?: string | null;
      readonly startedAt?: string | null;
    }[];
  };
}

interface BranchOf {
  readonly headRefName: string;
  readonly headRepository: { readonly nameWithOwner: string } | null;
}

/** One merge-queue entry as the query returns it. */
interface QueueNode {
  readonly position: number;
  readonly state: string;
  readonly enqueuedAt: string;
  readonly estimatedTimeToMerge: number | null;
  readonly enqueuer: { readonly login: string } | null;
  readonly pullRequest: ({ readonly number: number; readonly url: string } & BranchOf) | null;
  readonly headCommit: { readonly oid: string; readonly statusCheckRollup: Rollup | null } | null;
}

/** One labelled open pull request as the query returns it. */
interface LabelledNode extends BranchOf {
  readonly number: number;
  readonly url: string;
  readonly isDraft: boolean;
  readonly isInMergeQueue: boolean;
  readonly timelineItems: {
    readonly nodes: readonly {
      readonly createdAt?: string;
      readonly label?: { readonly name: string } | null;
      readonly actor?: { readonly login: string } | null;
    }[];
  };
  readonly commits: {
    readonly nodes: readonly {
      readonly commit: { readonly oid: string; readonly statusCheckRollup: Rollup | null };
    }[];
  };
}

/** The query's `repository`. `mergeQueue` is null on a repository without one. */
export interface QueueRepository {
  readonly mergeQueue: { readonly entries: { readonly nodes: readonly QueueNode[] } } | null;
  readonly pullRequests: { readonly nodes: readonly LabelledNode[] };
}
