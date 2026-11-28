---
"@halonicjs/app-studio": patch
---

Two new release action steppers: merge a release pull request directly at the head commit the request names (it stops if the pull request is closed, comes from a fork or its head changed since the request; GitHub refuses the merge if the head moves after the check, and on a branch that requires a merge queue unless you may bypass its rules, which skips the queue's checks), and approve a staged npm version on npmjs.com, with exact steps to check its commit and ref first.
