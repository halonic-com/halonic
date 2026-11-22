---
"@halonicjs/app-studio": patch
---

When an integration secret has `hosts` but no `as`, the problem Halonic reports now puts those field names in quotes and says Halonic reads the secret as a sign-in's client secret.
