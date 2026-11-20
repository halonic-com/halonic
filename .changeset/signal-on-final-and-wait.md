---
"@halonicjs/app-studio": patch
---

A `signal:` on a workflow's final step is now sent when the run ends, so a routine can start on it. `halonic validate` and the Studio now refuse a `signal:` on a wait step, which can't send one, and say to put it on the step after it.
