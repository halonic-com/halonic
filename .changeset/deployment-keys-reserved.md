---
"@halonicjs/app-studio": patch
---

A workspace can no longer name `cloud-key`, `user-secrets-key` or `admin-key-hash` as a secret: those belong to a deployment, so a model or provider that names one is refused like `token-key`.
