---
"@halonicjs/app-studio": patch
---

A deployment in `deployments.yaml` can now have a `users` block for who may use it (`mode`) and how their usage is counted (`meter` and its limits); `halonic validate` checks it, but this version doesn't act on it yet, and `halonic deploy` refuses `meter: cloud`.
