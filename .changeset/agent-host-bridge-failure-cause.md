---
"@halonicjs/app-studio": patch
---

When a run's bridge fails to open in the agent host, the run now keeps the error's kind and typed cause, as it does with the bridge in Studio's own process. A bridge socket path longer than the system takes then reads as a known cause instead of "Halonic can't tell the cause yet".
