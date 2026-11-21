---
"@halonicjs/app-studio": patch
---

`halonic serve` now says when a webhook routine can't start because of a trigger value it doesn't have, prints a line when it refuses a signed webhook request (with the reason, or `--debug` for more), and a new how-to explains how to sign one.
