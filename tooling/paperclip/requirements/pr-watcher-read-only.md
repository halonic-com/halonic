# paperclip.pr-watcher-read-only

- Status: active
- Since: unreleased
- Source: HAL-15359; the PR watcher's GitHub access in the seat plan on HAL-15298 (section 3, item 2); GraphQL queries added by HAL-16003 (the supervision plugins plan on HAL-15997, change 5)

The PR watcher shall send only GET requests, and GraphQL documents that are a single query, to GitHub, and only to the GitHub API's own origin, so its token reaches nothing else and changes nothing.

## Examples

- Given a full watcher run against recorded GitHub answers,
  when it finishes,
  then every GitHub request it sent was a GET to `https://api.github.com` or a POST to `https://api.github.com/graphql`.
- Given a path that would resolve to another host,
  when the reader is asked for it,
  then it refuses and sends nothing.
