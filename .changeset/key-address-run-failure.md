---
"@halonicjs/app-studio": patch
---

`halonic run` and `halonic runs show` now say why a run stopped at a provider's address instead of saying Halonic can't tell the cause: a key that may not go to its provider's address names the provider, the key and the address, with the `halonic models allow-address` command, and a workspace that isn't trusted on this computer says so, with `halonic trust`. `halonic run` exits with code 7 for these.
