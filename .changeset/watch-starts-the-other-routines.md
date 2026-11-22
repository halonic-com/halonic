---
"@halonicjs/app-studio": patch
---

`halonic routines watch` no longer stops for a routine whose file has errors: it says that routine can't start and starts the others, and `halonic serve` now says "can't start" for a webhook routine it refuses, as the list and the Studio do.
