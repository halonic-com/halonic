---
"@halonicjs/app-studio": patch
---

When your user account can't read the plugins folder, `halonic plugin list` and `halonic doctor`'s Plugins line now name the folder and say how to fix it, such as "Run chmod 700 <folder>, then run again.", instead of asking you to report a bug.
