---
"@halonicjs/app-studio": patch
---

A deployment's `users.config` in `deployments.yaml` can now list `organisations` whose members share a pool of limits, and `halonic validate` warns when `meter: config` has no limits, because it then counts nothing.
