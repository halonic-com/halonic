---
"@halonicjs/app-studio": patch
---

On Windows, an update run as administrator that doesn't start no longer goes back to the version before by itself, because the installer it would start is in a folder other programs can change: the new version stays, and `updates.log` says how to go back.
