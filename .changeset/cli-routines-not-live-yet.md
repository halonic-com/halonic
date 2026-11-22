---
"@halonicjs/app-studio": patch
---

`halonic routines` now says "Not live yet" for a routine that was never committed, since the watch doesn't run it. A routine whose saved changes have errors is listed as last committed, since that's the version the watch runs. `halonic routines watch` says when a routine that couldn't start can start again.
