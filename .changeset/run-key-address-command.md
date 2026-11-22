---
"@halonicjs/app-studio": patch
---

When a run stops because a key in the profile's secrets file isn't allowed to go to its provider's address, Studio's run page now gives the `halonic models allow-address` command with Copy command, instead of pointing to Models, which can't change that key's addresses.
