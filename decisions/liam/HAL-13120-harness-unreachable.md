# Decision: the agents host rejects when it can't ask the agent host, so the Harness page says "Couldn't check"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13120 (the designer's H1, a detail of the approved Harness page). Liam wrote this pull request, so Julian approves the note in review.
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:G02RufNtYrZlNuNrvLLVQouAN16XQHM/uMeGWx5wigmAzkwLbbLzzD93OYmxj+pm87HiktLD/lBwO5qMT2yuCA==

`WorkspaceAgents.harnessReadiness` answered `failed` both for the agent host's own `failed` answer and when the host couldn't be asked at all (a throw from `detectHarness`, or no `detectHarness`). The Harness page then said "Found Claude Code, but couldn't ask its version: The engine isn't answering." when nothing was found. Now `failed` is only the host's own answer, and the other two reject with the reason (`unavailable` when there is no host), so the page's existing `unreachable` line says "Couldn't check Claude Code: reason", as D3 on HAL-12697 asked. `studio.workspace-agents` changes that one promise and its example, and gains an example for the throwing host. No test is removed; the test of a host-less check now expects the rejection.

## Covers

- studio.workspace-agents
