---
"@halonicjs/app-studio": patch
---

Stopping a chat turn that runs on a remote host now always ends it; before, it could sometimes keep waiting for the model's answer.
