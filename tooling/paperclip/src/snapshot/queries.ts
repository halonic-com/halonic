/**
 * The snapshot's GraphQL documents. Sizes are what GitHub accepted on 22 Nov:
 * a page of 25 open pull requests costs 14 points, a page of 100 closed ones
 * 1 point. Checks are read as the head commit's rollup, not per check suite:
 * filtering check runs by name inside 20+ suites exceeds GitHub's resource
 * limits on a page of 50.
 */

/** Pull requests per page of open ones, with their reviews, comments and checks. */
export const openPageSize = 25;

/** Pull requests per page of closed ones, which carry only their state. */
export const closedPageSize = 100;

/** Merge commits per query when reading `ci-ok` on them. */
export const commitBatchSize = 20;

const checkRuns = `contexts(first: 100) {
  pageInfo { hasNextPage }
  nodes { ... on CheckRun { name status conclusion startedAt } }
}`;

/**
 * One page of a repository's open pull requests, and on the first page
 * (`$withQueue`) its merge queue with each group commit's checks: `ci-ok`,
 * and the jobs still waiting for a runner. A job waiting on another job has
 * no check run yet, so a queued one waits for a runner.
 */
export const openPullsQuery = `query OpenPulls($owner: String!, $name: String!, $after: String, $withQueue: Boolean!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    isPrivate
    mergeQueue @include(if: $withQueue) {
      entries(first: 100) {
        nodes {
          position state enqueuedAt estimatedTimeToMerge solo
          enqueuer { login } pullRequest { number }
          headCommit { oid statusCheckRollup { ${checkRuns} } }
        }
      }
    }
    pullRequests(states: OPEN, first: ${openPageSize}, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number url title isDraft mergeable updatedAt isInMergeQueue author { login }
        headRefName headRefOid baseRefName headRepository { nameWithOwner }
        labels(first: 20) { nodes { name } }
        timelineItems(itemTypes: [LABELED_EVENT], last: 20) {
          nodes { ... on LabeledEvent { createdAt label { name } actor { login } } }
        }
        baseChanges: timelineItems(itemTypes: [BASE_REF_CHANGED_EVENT, AUTOMATIC_BASE_CHANGE_SUCCEEDED_EVENT], last: 1) {
          nodes {
            ... on BaseRefChangedEvent { createdAt previousRefName }
            ... on AutomaticBaseChangeSucceededEvent { createdAt oldBase }
          }
        }
        reopens: timelineItems(itemTypes: [REOPENED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT], last: 1) {
          nodes {
            ... on ReopenedEvent { createdAt }
            ... on HeadRefForcePushedEvent { createdAt }
          }
        }
        commits(last: 1) { nodes { commit { committedDate committer { email } statusCheckRollup { ${checkRuns} } } } }
        reviews(last: 50) {
          nodes {
            databaseId state body submittedAt authorAssociation commit { oid } author { login }
            comments(last: 20) {
              nodes { databaseId createdAt authorAssociation commit { oid } originalCommit { oid } }
            }
          }
        }
        comments(last: 100) { nodes { databaseId body createdAt authorAssociation } }
      }
    }
  }
}`;

/** One page of closed and merged pull requests, newest update first. */
export const closedPullsQuery = `query ClosedPulls($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: [CLOSED, MERGED], first: ${closedPageSize}, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number url title state updatedAt mergedAt
        headRefName headRefOid baseRefName headRepository { nameWithOwner }
        mergeCommit { oid }
      }
    }
  }
}`;

/** The checks of `count` commits, passed as variables `$c0`, `$c1`, …, never in the text. */
export function commitChecksQuery(count: number): string {
  const indexes = Array.from({ length: count }, (_, index) => index);
  const variables = indexes.map((index) => `, $c${index}: GitObjectID!`).join("");
  const objects = indexes
    .map(
      (index) =>
        `c${index}: object(oid: $c${index}) { ... on Commit { statusCheckRollup { ${checkRuns} } } }`,
    )
    .join("\n    ");
  return `query CommitChecks($owner: String!, $name: String!${variables}) {
  repository(owner: $owner, name: $name) {
    ${objects}
  }
}`;
}
