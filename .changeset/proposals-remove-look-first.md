---
"@halonicjs/app-studio": patch
---

When a run's changes were deleted outside Halonic, `halonic proposals` now says to check with `halonic proposals show` before removing the run, since `reject` rejects the changes if they came back.
