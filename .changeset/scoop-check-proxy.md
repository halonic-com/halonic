---
"@halonicjs/app-studio": patch
---

On a Scoop install, the desktop app's update check now goes through `HTTPS_PROXY` and `NO_PROXY` by Halonic's rules, as the rest of the app does, and says when the proxy setting or the proxy stopped it.
