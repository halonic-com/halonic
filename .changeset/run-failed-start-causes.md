---
"@halonicjs/engine": patch
"@halonicjs/events": patch
---

`run.failed` for `sandbox-start-failed` gives the sandbox's reason code as `sandboxReason` when the sandbox check fails once the sandbox didn't open, and `harness-start-failed` gives `harnessCause` (`not-installed` or `signed-out`) when the harness's `detect()` says why.
