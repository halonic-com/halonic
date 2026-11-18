---
"@halonicjs/app-studio": patch
---

`halonic tools review` and Studio's tools review now say a tool "Doesn't ask before each use" only when a run really doesn't ask: the connector file's `tools.read` names it, `tools.approve` doesn't, and its server doesn't list it as sending. Before, every tool `tools.approve` didn't name showed that line, while each run still stopped to ask.
