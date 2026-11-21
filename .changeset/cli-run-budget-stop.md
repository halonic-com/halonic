---
"@halonicjs/app-studio": patch
---

`halonic run` and `halonic runs show` now say when a run stopped at its run or monthly budget, with the key to raise in workspace.yaml (`budget.perRun` or `budget.monthly`), instead of "Halonic can't tell the cause yet". `halonic run` exits 8 (limit reached) for a budget stop, rather than 1.
