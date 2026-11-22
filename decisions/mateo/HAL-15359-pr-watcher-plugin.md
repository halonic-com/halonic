# Decision: the PR watcher runs as the Agent tools plugin's first job

- Approval: the board decided on HAL-15359 (22 Nov) and Liam approved the plan there; he reviews it and signs this note as the CTO
- Kind: internal

The board decided on 22 Nov that the PR watcher runs as the first job of
the Agent tools plugin (HAL-15920, trigger A1), not as a `process` agent,
because Paperclip's web app can't create process agents. Liam approved the
plan on HAL-15359 the same day, with stricter rules for marking a task done.

- The plugin API can't read a task's work products, so the watcher finds
  pull requests by branch name (`<agent>/HAL-<n>-…`) instead of by link.
  `paperclip.pr-watcher-done` and `paperclip.pr-watcher-wake` say "its pull
  requests" instead of "linked pull requests". Done also needs every branch
  to name the agent that holds the task and no unfinished child task. Wake
  now also asks Paperclip to wake the author, since a plugin's comment
  wakes nobody.
- The HTTP Paperclip client and its test
  (`tooling/paperclip/src/pr-watcher/paperclip.test.ts`) are removed: there
  is no process agent with its own key any more. The plugin's host adapter
  replaces it, with its own tests (`src/plugin/host.test.ts`,
  `src/plugin/job.test.ts`), so `paperclip.pr-watcher-wake` loses those four
  tests.
- `tooling/check/dependencies.json` adds `@paperclipai/plugin-sdk` (Liam
  approved it on HAL-15359, pinned to 2026.1117.0) and lets
  `@halonicjs/tooling-paperclip` use `esbuild` to bundle the plugin.

## Covers

- paperclip.pr-watcher-done
- paperclip.pr-watcher-wake
- tooling/paperclip/src/pr-watcher/paperclip.test.ts
- tooling/check/
