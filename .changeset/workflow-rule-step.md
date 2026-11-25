---
"@halonicjs/app-studio": patch
---

Workflow files can have a `rule` step (`type: rule`), which runs a pure function of the hub with no model; `halonic validate` checks that it names its file and its output. Running one needs an engine that runs rules, which comes in a later release; until then the run stops at the step and says so.
