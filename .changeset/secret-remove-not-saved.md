---
"@halonicjs/app-studio": patch
---

`halonic secret remove` now says when no secret is set under that name, and how to see the names that are, instead of saying it removed it. When a `HALONIC_SECRET_` variable still holds it, it says so and names the variable.
