---
"@halonicjs/app-studio": patch
---

`halonic validate` also refuses a for-each step whose workflow runs, through a workflow step, a workflow that has a wait step, because an item's run can't wait.
