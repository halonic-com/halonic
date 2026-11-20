---
"halonic": patch
"@halonicjs/app": patch
---

`halonic tools approve <source> <tool>` still approves a tool the connector file's `tools.allow` leaves out, and now says that agents never see it until `tools.allow` names it.
