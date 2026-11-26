---
"@halonicjs/app-studio": patch
---

A call to a local integration that a service refused (it didn't accept the key, didn't allow the action or asked to slow down), or whose code tried a site its sheet doesn't list, now counts as failed when nothing else in the call went through, so the run goes on instead of waiting for you.
