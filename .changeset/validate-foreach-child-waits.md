---
"@halonicjs/app-studio": patch
---

`halonic validate` and Studio refuse a for-each step whose workflow has a wait step, since a run for one item can't wait, instead of the run failing there.
