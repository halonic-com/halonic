---
"@halonicjs/app-studio": patch
---

When Get updates refuses because the shared copy changed a file Halonic leaves to git, it now names the command to run (`git pull --no-rebase` in the workspace folder) and what to do after.
