---
"@halonicjs/app-studio": patch
---

When a step reads an input field the workflow doesn't have, `halonic validate` no longer tells you to add it to the workflow's tests when the workflow has none, and reads naturally when the input has only one field. `halonic run` and `halonic runs --workflow` in a workspace with no workflows now point to the recipes to add one from.
