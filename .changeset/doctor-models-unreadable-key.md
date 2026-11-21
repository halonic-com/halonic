---
"@halonicjs/app-studio": patch
---

When `halonic doctor` can't read a cloud provider's key from the secret store (for example, a locked keychain), the Models line now warns that it couldn't read the key instead of saying the key isn't set, so you aren't told to set a key that's already there.
