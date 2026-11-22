---
"@halonicjs/app-studio": patch
---

When a run stops because its provider's address isn't allowed for a key in the profile's secrets file, Studio's run page now gives the `halonic models allow-address` command to copy and Run again, instead of pointing to Models, which can't change that key's addresses.
