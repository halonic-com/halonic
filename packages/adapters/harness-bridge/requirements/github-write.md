# harness-bridge.github-write

- Status: active
- Since: unreleased
- Source: HAL-3107 (step 3 of HAL-3023, plan section 4.5); follows `harness-bridge.github-read`

The Node bridge shall offer, as `BridgeTools` the engine can serve at `/mcp` under the rules of `harness-bridge.mcp`, two tools that write to one GitHub repository fixed when the tools are made: `github_open_pull_request`, which takes a `title`, a `head` branch and a `base` branch, and may take a `body` and `draft`; and `github_update_pull_request`, which takes a pull request `number` and a new `title`, a new `body` or both. The program shall never name the repository. The tools shall make only a `POST` to the repository's `pulls` path or a `PATCH` to one pull request's path, to `https://api.github.com`, and shall not follow a redirect. They shall offer no way to merge, close, delete, release or publish, and an argument they don't list shall get an error result.

Writing is outward-facing, so the check of a call to either tool shall be `ask`, which sends it to a person under `harness-bridge.approvals`, when its arguments are acceptable, and `refused`, without asking anyone, when they are not. A title is text of 1 to 256 characters, a body is text of at most 65,000, a number is a whole number of 1 or more, and `head` and `base` are the names of different branches of the repository itself: a name with an `owner:` prefix, which would name a fork, is not acceptable. The check of any other name shall be `refused`. The call shall run the same checks again before it writes.

The token shall be read from the `Secrets` port, by the secret's name, on each call, and shall go only in the `authorization` header of the call to GitHub. It is meant to be short-lived, for this one repository, with the right to write pull requests and nothing else, so that GitHub's own branch protection stays the limit. The rules of `harness-bridge.github-read` for a secret that isn't set, can't be read or can't go in a header, and for errors, results and the size of GitHub's answer, apply here too: no result, error or event shall contain the token, GitHub's error text or a network failure's own text. The result of a call that worked shall hold the pull request's number, title, state, draft flag and address.

## Examples

- Given acceptable arguments,
  when the bridge checks `github_open_pull_request`,
  then the answer is `ask`.
- Given a `head` of `someone:topic`,
  when the bridge checks the call,
  then it is refused and no one is asked.
- Given an approved call to `github_update_pull_request` with `number: 12` and a new title,
  when the tool runs,
  then GitHub was sent one `PATCH` to pull request 12 with only the title, and the result holds the number and address.
- Given a call to `github_merge_pull_request`,
  when the bridge checks it,
  then it is refused.
- Given GitHub answers 422,
  when the tool answers,
  then the result is an error that names the status and none of GitHub's words.
