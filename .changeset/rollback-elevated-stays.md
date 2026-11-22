---
"@halonicjs/app-studio": patch
---

On Windows, when Windows raised an update to administrator rights from a limited account and the new version doesn't start, the update no longer goes back to the version before by itself, because the installer it would start is in a folder the account's other programs can change: the new version stays, and `updates.log` says how to go back.
