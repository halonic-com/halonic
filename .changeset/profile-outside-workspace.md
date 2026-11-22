---
"@halonicjs/app-studio": patch
---

The CLI refuses a workspace that holds your profile folder because `HALONIC_HOME`, `XDG_DATA_HOME` or `LOCALAPPDATA` put it there, and a workspace inside the profile folder, and says to move the profile and set `HALONIC_HOME` to its new place.
