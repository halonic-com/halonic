---
"@halonicjs/app-studio": patch
---

When a service refuses an integration's call after an earlier step may already have done its work, the run's step in Studio and in `halonic runs show` now names the cause and says to check before you try again, and a tool that only reads no longer says "Nothing was sent twice.".
