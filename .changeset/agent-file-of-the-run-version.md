---
"@halonicjs/app-studio": patch
---

`halonic run` and `halonic runs send` now check an agent set to On this computer against its file in the version the run starts, so a saved change to that file that isn't live yet doesn't count.
