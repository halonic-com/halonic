---
"@halonicjs/app-studio": patch
---

Trust hardening: a local connector's trust now also covers the workspace files its command names, such as `tools/server.js` in `node tools/server.js`, so changing one asks for trust again.
