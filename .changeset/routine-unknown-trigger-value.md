---
"@halonicjs/app-studio": patch
---

A routine whose input uses a trigger value it doesn't have, such as `{{trigger.date}}`, now fails `halonic validate` with the reason and doesn't start, where it used to run with that input left blank.
