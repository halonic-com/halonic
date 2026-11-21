# paperclip.pr-watcher-read-only

- Status: active
- Since: unreleased
- Source: HAL-15359; the PR watcher's GitHub access in the seat plan on HAL-15298 (section 3, item 2)

The PR watcher shall send only GET requests to GitHub, and only to the GitHub API's own origin, so its token reaches nothing else.

## Examples

- Given a full watcher run against recorded GitHub answers,
  when it finishes,
  then every GitHub request it sent was a GET to `https://api.github.com`.
- Given a path that would resolve to another host,
  when the reader is asked for it,
  then it refuses and sends nothing.
