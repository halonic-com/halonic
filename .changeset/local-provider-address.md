---
"@halonicjs/app-studio": patch
---

In a local-only workspace, a model provider whose file says `local: true` counts as local only when its address is on this computer or its local network; a provider at a public address is reported by `halonic validate` and isn't used as a local model.
