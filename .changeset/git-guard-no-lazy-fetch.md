---
"@halonicjs/app-studio": patch
---

Studio's git never fetches a missing object from a remote while it reads a folder, and a folder whose `.git/config` sets `extensions.partialClone` or `remote.<name>.promisor` is refused with the key named.
