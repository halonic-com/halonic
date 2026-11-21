---
"@halonicjs/app-studio": patch
---

`halonic doctor` now shows a Secrets line that fails when a secret a used connector, provider or webhook routine needs isn't set, with the `halonic secret set` command to fix it, and exits 1 instead of passing. It names the secret, never its value.
