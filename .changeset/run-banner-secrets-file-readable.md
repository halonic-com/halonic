---
"@halonicjs/app-studio": patch
---

When a run stops because the secrets file can be read by other users, the run page now names the file and says to run chmod 600 on it, like the CLI.
