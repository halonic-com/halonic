---
"@halonicjs/app-studio": patch
---

`halonic run`, `halonic runs send` and `halonic routines watch` refuse a workspace whose files have errors, before anything starts, and point you to `halonic validate`. `halonic doctor` shows the same problem on its Workspace line.
