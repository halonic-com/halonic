---
"@halonicjs/app-studio": patch
---

When a plugin record file can't be read or is damaged, `halonic plugin list` and `halonic plugin remove` now name the file and say how to fix it, such as "Delete line 2 from it, or delete the file, then run again.", instead of asking you to report a bug.
