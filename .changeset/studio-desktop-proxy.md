---
"@halonicjs/app-studio": minor
---

The Studio desktop app's own model calls now honour `HTTPS_PROXY` and `NO_PROXY` by the same rules as the CLI: public `https` hosts go through an `http://` proxy by tunnel, and a setting that can't be used fails the call instead of going direct.
