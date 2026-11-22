---
"@halonicjs/app-studio": patch
---

On Windows with the WSL sandbox, when a local integration can't start without the sandbox, `halonic run` now says to start the run in Halonic Studio, where you can allow it, because the command can't see a yes given in Studio.
