---
"@halonicjs/app-studio": patch
---

A secret in an `integration.yaml` with `hosts` and no `as` now says to add `as: bearer`, `header` or `form`, instead of saying it has no field `hosts`.
