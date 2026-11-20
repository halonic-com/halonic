---
"@halonicjs/app-studio": patch
---

A run that fails because the bridge's socket path is too long now says how to fix it: move Halonic's data folder to a short path, such as `~/.halonic`, and set `HALONIC_HOME` to it. The README's new Environment section explains `HALONIC_HOME`.
