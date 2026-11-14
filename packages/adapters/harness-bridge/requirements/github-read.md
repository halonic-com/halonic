# harness-bridge.github-read

- Status: active
- Since: 0.1.0
- Source: HAL-3104 (step 2 of HAL-3023, plan section 4.5); first slice of HAL-194's MCP endpoint

The Node bridge shall offer, as `BridgeTools` the engine can serve at `/mcp` under the rules of `harness-bridge.mcp`, four read-only tools on one GitHub repository fixed when the tools are made: `github_get_pull_request`, `github_get_pull_request_diff`, `github_list_pull_request_files` and `github_get_pull_request_checks`. Each takes one pull request `number`, a whole number of 1 or more; any other value shall get an error result without a call to GitHub. The program shall never name the repository. Each tool shall make only `GET` calls, to `https://api.github.com`, and shall not follow a redirect. The `github_get_pull_request` result shall hold the pull request's number, title, state, author, branches, head commit, description and counts; `github_get_pull_request_diff` its diff as text; `github_list_pull_request_files` each file's name, status and line counts; `github_get_pull_request_checks` the head commit and each check's name, status and conclusion.

The token shall be read from the `Secrets` port, by the secret's name, on each call, and shall go only in the `authorization` header of the call to GitHub. A secret that isn't set, or holds something that can't go in a header, shall give an error result that names the secret and never its value. No result, error or event shall contain the token, GitHub's error text or a network failure's own text: a failed call shall give a result that names only the status (401, 403, 404, a redirect or another status) or that GitHub could not be reached. A result over the limit (200,000 bytes by default) shall be cut and shall say how long it was. Every call shall be checked as `run` when it names one of the four tools, otherwise `refused`; the bridge records the calls that run as `tool.called` and `tool.result`.

## Examples

- Given pull request 12,
  when the program calls `github_get_pull_request` with `number: 12`,
  then it gets the pull request's title, state, author and branches, and GitHub was sent one `GET` with the token.
- Given a call with `number: 0`,
  when the tool answers,
  then the result is an error and GitHub was not called.
- Given GitHub answers 302,
  when the tool answers,
  then the result is an error that names the redirect, and nothing else was fetched.
- Given a secret that isn't set,
  when the program calls any tool,
  then the result is an error that names the secret and GitHub was not called.
