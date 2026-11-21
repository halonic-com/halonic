---
"@halonicjs/app-studio": patch
---

In the CLI, a harness agent's provider file can no longer send its key to one of Halonic's own ports, such as another run's bridge or `halonic serve`'s; the call fails and nothing is sent.
