---
"@halonicjs/app-studio": patch
---

In Studio, routines now start as they are in the workspace's live version, as `halonic routines watch` does. A saved change to a routine counts once you make it live, and a routine that was never live doesn't start. Turning a routine on or off still counts as soon as you save.
