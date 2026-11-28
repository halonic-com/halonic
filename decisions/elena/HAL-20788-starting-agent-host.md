# Decision: the starting line reads "Starting the agent host…"

- Task: HAL-20788 (from the post-merge words and a11y check on HAL-20783, for #6826)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20788 (the CTO: approved on head `3ec3236`)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kW820w0G1BVcjGkJKjRc9Uwj0Ht0GhBjc4OEcVmtZasVDWLA12VWYKpMZ2SWnMg9qgFSgE1kPq9+Nopjxcr3Bg==

## What changes

- `runs.sandbox-cant-run`, `workflows.page.cant-run` and `routines.page.cant-run`: the line that
  describes Run, Run now and Send while the first sandbox check hasn't answered reads "Starting the
  agent host…" instead of "Agent host is still starting". Nothing else in these requirements
  changes: which controls are unavailable, when, and how the line is shown stay as they were.

## Why

The old line had no article and no end mark, so a screen reader read the accessible description of
every control it turns off as an unfinished fragment. The new line follows the other start lines in
Studio, such as the approved "Starting the engine…", so no design check is needed.

## Tests

No test was weakened or skipped. The tests for the callout, the chat box line, the routine page and
the workflow page assert the new text where they asserted the old one.

## Covers

- runs.sandbox-cant-run
- workflows.page.cant-run
- routines.page.cant-run
