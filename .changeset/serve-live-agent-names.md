---
"@halonicjs/app-studio": patch
---

`halonic serve` shows a renamed agent's new name in the waiting list as soon as the rename is committed, and `halonic validate` refuses a webhook routine whose secret name belongs to Halonic or a plugin, such as `serve-password`.
