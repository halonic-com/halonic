---
"@halonicjs/app-studio": patch
---

`halonic validate` and Studio refuse a for-each step whose workflow has a wait step, since an item's run can't wait, instead of the run failing there.
