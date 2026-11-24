---
"@halonicjs/app-studio": patch
---

When OpenRouter is busy or down during a harness agent's model call, Halonic now sends the call to the next host its model alias falls back to, if that alias uses the same model and provider file and keeps your data at least as safe, and the run log shows which alias served each call.
