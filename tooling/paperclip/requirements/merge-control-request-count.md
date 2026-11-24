# paperclip.merge-control-request-count

- Status: active
- Since: unreleased
- Source: HAL-17863; Liam's review of halonic-com/halonic#5761 (HAL-17783): the facts reader shares the PR watcher's read-only token, so the shadow day must show each pass's GitHub requests before merge control acts

When merge control's facts reader finishes a pass, whether it succeeded or failed, the plugin shall log the number of REST GET requests and GraphQL queries it sent to the GitHub API in that pass, the sum of the GraphQL rate-limit cost the answers named, and the points left from the newest answer that named them.

## Examples

- Given recorded GitHub answers where only the pull requests page names a cost of 2 points with 4990 left,
  when the reader runs a pass,
  then the log line's REST GET and GraphQL query counts equal the requests the fake GitHub received, with cost 2 and 4990 points left.
- Given a REST GET that fails after the first GraphQL query,
  when the pass fails,
  then the log line still says 1 REST GET and 1 GraphQL query.
