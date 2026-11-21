---
"@halonicjs/app-studio": patch
---

The run log has a new `bridge.failed` event for a request the harness bridge failed without naming the reason to the agent's program, with the error kind and its message. The bridge's recorder takes it, and it never counts towards a budget. Logs written before it read as before.
