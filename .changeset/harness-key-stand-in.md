---
"@halonicjs/app-studio": patch
---

In `halonic run`, a sandboxed Claude Code agent that uses a provider key Halonic keeps now gets its stand-in key instead of running signed out, and a key that may not be sent is refused with the same words and exit code as a model call.
