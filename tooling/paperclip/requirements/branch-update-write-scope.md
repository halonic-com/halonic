# paperclip.branch-update-write-scope

- Status: active
- Since: unreleased
- Source: HAL-18031; the branch credential of the merge-control ADR (HAL-17700); Julian's OK with changes on HAL-18035

When the PR watcher rebases a branch, the plugin shall send only GitHub's `updatePullRequestBranch` mutation with `updateMethod: REBASE` written into the document and only the variables `pullRequestId` and `expectedHeadOid`, as a POST to `https://api.github.com/graphql`, only for an open pull request of the repository it may write to whose head branch is in that repository, still at the head the watcher read, and neither `main` nor protected nor under a ruleset, all read with the read token; it shall refuse anything else before it is sent, resolve the branch token at each rebase and keep it out of its state, logs and what it returns, and build the client only in the stack rebase job. Widening it to `MERGE` or adding any other mutation needs Julian's OK again.

## Examples

- Given an open pull request on an agent's branch at the head the watcher read,
  when the client rebases it,
  then it sends the one mutation with that pull request's node id and head, and asks for the token once.
- Given another address, method, document, or variable,
  when it is checked,
  then it is refused.
- Given a fork's branch, a moved head, `main`, a protected or ruled branch, a closed pull request, another repository or a failed read,
  when the client is asked to rebase it,
  then it sends nothing and doesn't ask for the token.
- Given GitHub's error body or a network error that repeats the token,
  when the client returns the refusal,
  then the token is replaced by `[token]`.
- Given the package's source files,
  when they are read,
  then only the stack rebase job imports the branch write client.
