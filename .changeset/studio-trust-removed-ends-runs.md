---
"@halonicjs/app-studio": patch
---

Removing a workspace's trust while a run is going now ends that run at once as failed, saying the trust was removed, instead of leaving it shown as running. The Remove trust dialog says that runs in progress stop.
