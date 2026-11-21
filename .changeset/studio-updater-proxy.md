---
"@halonicjs/app-studio": patch
---

The Studio desktop app now checks for and downloads updates through `HTTPS_PROXY` by the same rules as its model calls, instead of reqwest's own reading of the proxy variables.
