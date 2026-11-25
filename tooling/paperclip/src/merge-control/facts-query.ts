/**
 * The GraphQL documents merge control's facts reader sends, and the shapes
 * of their answers. Every document is a single `query`, so the query-only
 * reader (`snapshot/graphql.ts`) accepts it, and asks for its `rateLimit`
 * so the pass can log what it cost. Review threads, the expensive part of
 * the PR watcher's page, aren't read.
 */

/**
 * Open pull requests per page. Each check's workflow run makes a page slow:
 * on 24 Nov a page of 25 timed out (504), one of 10 took about 6 seconds
 * and 2 points.
 */
export const factsPageSize = 10;

/** Files per `mainFilesQuery`. */
export const mainFileBatch = 40;

const rollup = `statusCheckRollup {
  contexts(first: 100) {
    pageInfo { hasNextPage }
    nodes {
      ... on CheckRun {
        databaseId name status conclusion startedAt detailsUrl
        checkSuite { status workflowRun { databaseId event createdAt workflow { name } } }
      }
    }
  }
}`;

/**
 * One page of open pull requests; the first page (`$withQueue`) also has
 * `main`'s head and the merge queue, with each group commit's checks for
 * the runner wait.
 */
export const factsPullsQuery = `query MergeFactsPulls($owner: String!, $name: String!, $after: String, $withQueue: Boolean!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    defaultBranchRef @include(if: $withQueue) { name target { oid } }
    mergeQueue @include(if: $withQueue) {
      entries(first: 100) {
        nodes {
          position state enqueuedAt enqueuer { login } pullRequest { number }
          headCommit { oid statusCheckRollup { contexts(first: 100) { nodes { ... on CheckRun { status startedAt } } } } }
        }
      }
    }
    pullRequests(states: OPEN, first: ${factsPageSize}, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number title createdAt isDraft isCrossRepository isInMergeQueue
        headRefName headRefOid baseRefName headRepositoryOwner { login }
        additions deletions changedFiles mergeable mergeStateStatus
        labels(first: 20) { nodes { name } }
        files(first: 100) { nodes { path additions deletions changeType } }
        timelineItems(itemTypes: [LABELED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT, BASE_REF_CHANGED_EVENT, AUTOMATIC_BASE_CHANGE_SUCCEEDED_EVENT, ADDED_TO_MERGE_QUEUE_EVENT, REMOVED_FROM_MERGE_QUEUE_EVENT], last: 50) {
          nodes {
            __typename
            ... on LabeledEvent { createdAt label { name } actor { login } }
            ... on HeadRefForcePushedEvent { createdAt }
            ... on BaseRefChangedEvent { createdAt }
            ... on AutomaticBaseChangeSucceededEvent { createdAt }
            ... on AddedToMergeQueueEvent { createdAt actor { login } }
            ... on RemovedFromMergeQueueEvent { createdAt actor { login } reason }
          }
        }
        commits(last: 1) { nodes { commit { committedDate ${rollup} } } }
        reviews(last: 50) { nodes { state body submittedAt commit { oid } author { login } } }
        comments(last: 100) { nodes { body createdAt author { login } } }
      }
    }
  }
}`;

/** Pull requests merged lately, newest first. */
export const factsMergedQuery = `query MergeFactsMerged($owner: String!, $name: String!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number mergedAt }
    }
  }
}`;

/** The text of `count` files on `main`, passed as `$e0`, `$e1`, … (`main:<path>`), never in the text. */
export function mainFilesQuery(count: number): string {
  const indexes = Array.from({ length: count }, (_, index) => index);
  const variables = indexes.map((index) => `, $e${index}: String!`).join("");
  const objects = indexes
    .map((index) => `f${index}: object(expression: $e${index}) { ... on Blob { text isBinary } }`)
    .join("\n    ");
  return `query MergeFactsMainFiles($owner: String!, $name: String!${variables}) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    ${objects}
  }
}`;
}

/** A login, or null when the account is gone. */
export type Login = { readonly login: string } | null;

/** One check run of a rollup, as `factsPullsQuery` reads it. */
export interface RollupRun {
  readonly databaseId?: number;
  readonly name?: string;
  readonly status?: string;
  readonly conclusion?: string | null;
  readonly startedAt?: string | null;
  readonly detailsUrl?: string | null;
  readonly checkSuite?: {
    readonly status?: string;
    readonly workflowRun?: {
      readonly databaseId: number;
      readonly event: string;
      readonly createdAt: string;
      readonly workflow: { readonly name: string };
    } | null;
  } | null;
}

/** A head commit's rollup; null when GitHub has none yet. */
export interface FactsRollup {
  readonly contexts: {
    readonly pageInfo?: { readonly hasNextPage: boolean };
    readonly nodes: readonly RollupRun[];
  };
}

/** One timeline item; which fields it has depends on its `__typename`. */
export interface TimelineItem {
  readonly __typename: string;
  readonly createdAt?: string;
  readonly label?: { readonly name: string };
  readonly actor?: Login;
  /** `RemovedFromMergeQueueEvent` only, such as `failed_checks`. */
  readonly reason?: string | null;
}

/** One open pull request. */
export interface PullNode {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly createdAt: string;
  readonly isDraft: boolean;
  readonly isCrossRepository: boolean;
  readonly isInMergeQueue: boolean;
  readonly headRefName: string;
  readonly headRefOid: string;
  readonly baseRefName: string;
  readonly headRepositoryOwner: Login;
  readonly additions: number;
  readonly deletions: number;
  readonly changedFiles: number;
  readonly mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  readonly mergeStateStatus: string;
  readonly labels: { readonly nodes: readonly { readonly name: string }[] };
  readonly files: {
    readonly nodes: readonly {
      readonly path: string;
      readonly additions: number;
      readonly deletions: number;
      readonly changeType: string;
    }[];
  } | null;
  readonly timelineItems: { readonly nodes: readonly TimelineItem[] };
  readonly commits: {
    readonly nodes: readonly {
      readonly commit: {
        readonly committedDate: string;
        readonly statusCheckRollup: FactsRollup | null;
      };
    }[];
  };
  readonly reviews: {
    readonly nodes: readonly {
      readonly state: string;
      readonly body: string;
      readonly submittedAt: string | null;
      readonly commit: { readonly oid: string } | null;
      readonly author: Login;
    }[];
  };
  readonly comments: {
    readonly nodes: readonly {
      readonly body: string;
      readonly createdAt: string;
      readonly author: Login;
    }[];
  };
}

/** One merge-queue entry. */
export interface QueueNode {
  readonly position: number;
  readonly state: string;
  readonly enqueuedAt: string;
  readonly enqueuer: Login;
  readonly pullRequest: { readonly number: number } | null;
  readonly headCommit: {
    readonly oid: string;
    readonly statusCheckRollup: FactsRollup | null;
  } | null;
}

/** One page of `factsPullsQuery`. */
export interface PullsPage {
  readonly repository: {
    readonly defaultBranchRef?: {
      readonly name: string;
      readonly target: { readonly oid: string };
    } | null;
    readonly mergeQueue?: { readonly entries: { readonly nodes: readonly QueueNode[] } } | null;
    readonly pullRequests: {
      readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
      readonly nodes: readonly PullNode[];
    };
  };
}
