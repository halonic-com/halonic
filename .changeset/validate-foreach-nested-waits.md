---
"@halonicjs/app-studio": patch
---

`halonic validate` and Studio now also refuse a for-each step whose workflow reaches a wait step through a workflow step, because a run for one item can't wait.
