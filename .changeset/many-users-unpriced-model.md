---
"@halonicjs/app-studio": patch
---

A deployment that lets many people sign in and stops them at a cost limit now refuses an agent whose model has no price, in `halonic validate` and when a run of it starts, so every call there counts its cost.
