# paperclip.github-snapshot

- Status: active
- Since: unreleased
- Source: HAL-16003; the supervision plugins plan on HAL-15997 (change 5: one GraphQL snapshot per pass instead of REST reads per job), approved by the board on 22 Nov

When the Agent tools plugin takes a GitHub snapshot, the plugin shall read each watched repository's merge queue, its open pull requests and those closed within the last 3 days with GraphQL queries only, sent only to `https://api.github.com/graphql`, and shall keep each pull request's state, branch, head, checks, labels, review finding and signed approvals as ids, states, names and times, never the text of a comment or review.

## Examples

- Given a GraphQL document that is a mutation,
  when the reader is asked to send it,
  then it refuses and sends nothing.
- Given GitHub's answer for an open pull request whose head has a green `ci-ok`, a reviewer's comment "changes requested on head …" and signed approvals,
  when the snapshot is taken,
  then it records `ci-ok` as `success`, the comment's id as the finding, each approval's reviewer and head, and none of the comments' text.
- Given a page of closed pull requests whose last one was updated more than 3 days before the snapshot,
  when the snapshot is taken,
  then it leaves that one out and reads no further page.
- Given a head commit with more than 100 checks where `ci-ok` isn't among the first 100,
  when the snapshot is taken,
  then it reads `ci-ok` on that commit another way instead of calling it missing.
- Given 2 merge commits whose `ci-ok` a decision needs,
  when their checks are read,
  then one query asks for both, with each commit passed as a variable, not in the query's text.
