---
"@halonicjs/engine": patch
---

A harness step keeps to its agent's `harnessLimits`: the engine refuses the model call past `maxSteps`, stops the step once it has cost `maxCost`, and stops it after `maxMinutes` of running time. The run log says which limit stopped it.
