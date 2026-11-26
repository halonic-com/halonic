---
"@halonicjs/app-studio": patch
---

A local integration whose code sends a request to a host its permission sheet doesn't list, or tries to send a secret where it may not, is now paused: that call fails, and the connector doesn't run again, in this run or a later one, until its code changes and you trust the workspace again.
