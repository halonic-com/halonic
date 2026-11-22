---
"@halonicjs/app-studio": patch
---

`halonic routines` and `halonic routines watch` say a routine can't start until its fix is committed when the fix is saved but not committed, instead of pointing to `halonic validate`, and lines that ask for a commit name Studio's Make live.
