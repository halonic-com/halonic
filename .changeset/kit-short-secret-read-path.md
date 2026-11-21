---
"@halonicjs/app-studio": patch
---

The kit now refuses a request with `secret-too-short` when a declared secret has fewer than 8 bytes, also when the request doesn't place it. Before, such a value was read for the carried-secret check and the response filter without the minimum: ordinary text that held it was refused or removed.
