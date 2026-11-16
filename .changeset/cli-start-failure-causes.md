---
"halonic": patch
---

`halonic run` and `halonic runs show` end a `sandbox-start-failed` line with the sandbox's reason, and word a `harness-start-failed` for a program that isn't installed or isn't signed in with the approved known-cause lines, when the run log gives `sandboxReason` or `harnessCause`. Older logs read as before.
