---
"@halonicjs/app-studio": patch
---

`halonic run` now starts a plugin's backend: it reads the plugin's own secrets instead of failing with "A workspace can't pick a secret that belongs to a plugin."
