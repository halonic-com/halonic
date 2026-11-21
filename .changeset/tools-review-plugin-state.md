---
"@halonicjs/app-studio": patch
---

`halonic tools review` and `tools approve` now warn when a plugin connector's plugin is off (not trusted yet, changed since you trusted it, or unreadable), suggest the plugin you probably meant when its name has a typo, and give the plugin's state as `pluginState` in `--json`.
