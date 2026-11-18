---
"halonic": patch
"@halonicjs/app": patch
"@halonicjs/app-studio": patch
"@halonicjs/engine": patch
---

A tool the connector file's `tools.allow` leaves out no longer asks for approval: `halonic tools review`, Studio's review screen and the notices of `halonic run` and `halonic runs send` count only the allowed tools. `halonic tools approve <source> <tool>` still approves a hidden tool by name, and now says that agents never see it until `tools.allow` names it.
