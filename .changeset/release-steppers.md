---
"@halonicjs/app-studio": patch
---

Two new release action steppers: merge a release pull request at the head commit its release card approved (it stops if the pull request is closed or its head changed since the request, and GitHub refuses the merge if the head moves after the check), and approve a staged npm version on npmjs.com, with exact steps to check its provenance first.
