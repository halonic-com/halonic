# paperclip-client.team-pull-requests

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, section 1.5, with Julian's security read HAL-17540); tasks HAL-17606 and HAL-17681

The Paperclip provider shall serve `TeamStatus`'s pull requests, one pull request's timeline and the merge queue from the `halonic.agent-tools` plugin's `github/summary` and `github/pr/{number}` with `GET` requests only, each on its fixed request list and pinned to its path, with `{number}` a positive integer of at most 9 digits, and shall send nothing for any other number. A pull request's author and reviewer shall be an agent of the company, "the board" or "outside contributor", never a login. Every `webLink` shall pass `isAllowedWebLink` for the connection's origin, and a link that fails it shall be dropped.

## Examples

- Given the provider's request list,
  when its pull request rows are read,
  then they are exactly `GET /api/plugins/halonic.agent-tools/api/github/summary` and `GET /api/plugins/halonic.agent-tools/api/github/pr/:number`, and `github/pr/0`, `-1`, `abc` and `1%2F..` match neither.
- Given pull requests opened by the board, by an outside contributor and by an account whose name is a login,
  when they are read,
  then their authors are "the board", "outside contributor" and "outside contributor".
- Given a pull request whose GitHub page would be `https://github.com/../app/pull/7`,
  when it is read,
  then it has no `webLink`.
