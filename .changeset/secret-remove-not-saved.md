---
"@halonicjs/app-studio": patch
---

`halonic secret remove` now says "No secret <name> is saved. Nothing changed." when no secret was saved under that name, instead of saying it removed it, and names the `HALONIC_SECRET_` variable that still holds it.
