---
"@halonicjs/app-studio": patch
---

On Windows, a silent install or uninstall now exits with code 41 when it didn't set up or remove the agent sandbox because the sandbox helper isn't signed by Halonic, instead of 0.
