# runs.run-view.harness-banner

- Status: active
- Since: 0.1.0
- Source: HAL-1845 part 2b; microcopy 22 F21 (HAL-751, approved on HAL-2264 P1, 11 Nov); Julian's QA notes 1 and 3 on #3131 (HAL-10908)

When a run failed with `harness-start-failed`, the run page's banner shall say which program didn't start, in the danger tone: "*Reporter* didn't start: Claude Code didn't start on this computer, or didn't answer within 60 seconds. Nothing ran in the step *Draft*.". The program comes from the log's last `harness.started` (Claude Code, Codex, or its id with a capital), the seconds from that event's `timeoutMs`, and the agent it names. The banner waits for the log, and until then the page's general banner shows. The engine's own error text shall never be on it.

A `model-out-of-memory` failure on a provider that runs elsewhere shall keep the page's general banner, because the memory sentence of `runs.run-view.failure-banners` says "this computer". A provider that is no longer in the workspace still gets that sentence.

Limits, for the docs: the sentences for a program that isn't installed or isn't signed in (F21b, F21c) come with a detail on `run.failed`. It has **Run again** (`runs.run-view.run-again`) but no **Copy details** yet, as for the other banners. With agents that run side by side, the last model call in the log may not be the one that failed.

## Examples

- Given a run that failed with `harness-start-failed` after `harness.started` for `claude-code` with a limit of 60000 ms,
  when its page is shown,
  then the banner reads "Reporter didn't start: Claude Code didn't start on this computer, or didn't answer within 60 seconds. Nothing ran in the step Draft.".
- Given a run that failed with `model-out-of-memory` after a call to a cloud provider,
  when its page is shown,
  then the page keeps its general banner.
