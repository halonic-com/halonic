---
"@halonicjs/app-studio": patch
---

`validate` now warns when a routine passes an input field its workflow doesn't read, such as `input.dya` for a workflow that reads `input.day`, and suggests the field it probably meant.
