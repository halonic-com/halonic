# Decision: the agent host's starting line reads "The agent host is still starting…"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20974 (the words check of HAL-20969 asked for this wording; no further words check needed)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G67wuGb/BqSE8Wllb2xwUAYTUzOrruK0gBQ17saukjXlP1SVDLcS9JdTQ/lnlZpLqXki+dr729QC8jZRgF2eAg==

## What changes

The line a Studio page shows while the agent host is still starting, first in the
can't-run callout and as the description of every run control it turns off, reads
"The agent host is still starting…" instead of "Agent host is still starting".
The requirements that quote it change their examples to the new words and
nothing else: when the line shows and what it turns off stay the same.

Tests changed: none weakened. The tests that compare the string now compare the
new one; no test or `expect` was removed.

## Why

The old line had no article and no ellipsis. Its neighbours are full sentences,
and states that end by themselves read like "Checking…" and "Starting Halonic…".

## Covers

- routines.page.cant-run
- runs.sandbox-cant-run
- workflows.page.cant-run
