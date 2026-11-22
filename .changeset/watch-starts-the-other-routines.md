---
"@halonicjs/app-studio": patch
---

`halonic routines watch` no longer stops when one routine's file has errors: it says that routine can't start and keeps running the others on time. `halonic serve` now says "can't start" for a webhook routine it refuses, as the list and the Studio do.
