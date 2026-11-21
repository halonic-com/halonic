---
"@halonicjs/app-studio": patch
---

`halonic validate` now stops a workflow whose run would fail: a task step without an agent, a for-each step whose items can't be a list or whose prompt uses the wrong item name, and a step whose transitions never take its done event; and a new workflow in Studio runs an agent of its hub when it has one.
