---
"@halonicjs/app-studio": patch
---

`halonic validate` refuses a provider file whose secret name belongs to Halonic or a plugin, such as `token-key`, and choosing a model never saves your key under such a name.
