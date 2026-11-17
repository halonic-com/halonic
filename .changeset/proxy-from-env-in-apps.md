---
"halonic": minor
"@halonicjs/app-agent-host": minor
---

`HTTPS_PROXY` and `NO_PROXY` are now honoured: model calls, Google sign-in and connectors over `https` go through an `http://` proxy by tunnel, and a setting that can't be used fails the request instead of going direct.
