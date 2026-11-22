---
"@halonicjs/app-studio": patch
---

When the agent sandbox needs setting up again on Windows, Settings no longer calls it a one-time setup, `halonic doctor` and a refused run say to run `halonic sandbox setup`, and a silent update that can't set it up again says so in `updates.log`.
