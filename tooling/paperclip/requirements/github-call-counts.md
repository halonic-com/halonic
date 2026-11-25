# paperclip.github-call-counts

- Status: active
- Since: unreleased
- Source: HAL-17933; Chief's sync of the board's changes of 25 Nov on HAL-16003 (item 2, GitHub call budget: the REST limit the Merger, the PR watcher, the Fast-track monitor and the Board Checker share ran out)

When the Agent tools plugin's PR watcher job takes its GitHub snapshot, the plugin shall count every GitHub call the snapshot makes, GraphQL queries and REST fallbacks alike, failed ones included, and keep that count, and which token made the calls (the read-only GitHub App's or the shared one), with the saved snapshot; and when the pass ends, it shall log its GitHub calls in total, the token they went out on, and by step (snapshot, watcher, thin-spec) and save the snapshot's count as the metric `pr_watcher.github_requests_snapshot`.

## Examples

- Given a pass for one company whose GitHub answers every request,
  when the pass ends,
  then its log line says "<total> GitHub calls on the shared token (snapshot <s>, watcher <w>, thin-spec <t>)", the three add up to the requests it sent, and the saved snapshot's `githubCalls` is `<s>` and its `githubToken` is `shared`.
