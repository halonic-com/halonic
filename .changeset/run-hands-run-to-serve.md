---
"@halonicjs/app-studio": patch
---

`halonic run` no longer refuses while `halonic serve` is running for the workspace: the running Studio starts the run, which shows in the Inbox on your phone, and `run` prints the run's id. With `--event`, `--harness` or `--follow` it still asks you to stop `serve` first.
