---
"@halonicjs/app-studio": patch
---

Halonic's git calls never fetch a missing object from a remote while they read a workspace, and a workspace whose `.git/config` sets `extensions.partialClone` or `remote.<name>.promisor` is refused with the key named.
