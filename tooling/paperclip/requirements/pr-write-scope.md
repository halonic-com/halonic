# paperclip.pr-write-scope

- Status: active
- Since: unreleased
- Source: HAL-18983, token plan Track B (HAL-18938); the board's OK of 26 Nov for one new GitHub permission, `pull_requests: write` on halonic-com/halonic only

When the PR tools write to GitHub, the plugin shall send only these requests to `https://api.github.com`, with the PR write token and only for halonic-com/halonic: a POST to open a pull request against `main` with no fields but title, body, head, base and draft; a PATCH of an open pull request's title or body; a POST that adds only the labels `built-on:paperclip` or `built-on:halonic`; and the GraphQL mutations `markPullRequestReadyForReview` and `convertPullRequestToDraft` with only `pullRequestId`. It shall refuse anything else before it is sent, `fast-track` and every queue label included, resolve the token at each write and only after the check, take the token out of any error it returns, and build the write client only in the PR write tools.

## Examples

- Given each of the five allowed writes,
  when they are checked,
  then each passes.
- Given a `fast-track` or queue label, another repository, a base other than `main`, a merge, an approval, a closed state, a branch push or the enqueue mutation,
  when they are checked,
  then each is refused, nothing is sent and the token is not asked for.
- Given GitHub answers 401 with a message that repeats the token,
  when the error is returned,
  then it carries the status and reason with the token replaced by `[token]`.
- Given the package's source files,
  when they are read,
  then only `write-pr.ts` and the plugin's `pr-write-tools.ts` import the PR write client.
