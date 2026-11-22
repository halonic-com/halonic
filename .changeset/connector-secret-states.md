---
"@halonicjs/app-studio": patch
---

A connector's page lists each secret once, says Studio keeps it in its own keychain, which `halonic secret set` doesn't reach, and empties a secret's entry when saving it fails.
