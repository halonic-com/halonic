---
"@halonicjs/app-studio": patch
---

When you approve a call whose connector can't start any more, because its program was removed or its secret isn't set, the run log now records the call as failed and says which program or secret is missing, instead of treating it as a tool the agent was never offered.
