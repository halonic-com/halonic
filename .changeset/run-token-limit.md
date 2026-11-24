---
"@halonicjs/app-studio": patch
---

`workspace.yaml` can set `budget.perRunTokens`: a run stops once it and its child runs have used that many tokens, all tokens counted, cache reads and writes included.
