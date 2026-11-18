---
"@halonicjs/app-studio": patch
---

Adding a plugin leaves `.git`, `.studio`, `.env*` and `.envrc` out of its files at any depth, in the CLI and the desktop app, so a plugin author's secrets don't end up in the plugins folder.
