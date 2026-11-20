---
"@halonicjs/app-studio": patch
---

`halonic validate` now reports a step that reads an input field the workflow doesn't have, with the name you probably meant, and a start field that no step reads. `halonic run` stops with exit code 2 when the input is missing a field the first step reads, and names the fields the input has, instead of running every step with the value unset.
