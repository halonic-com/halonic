---
"@halonicjs/app-studio": patch
---

The CLI now says what's wrong, and how to fix it, when `HALONIC_HOME` isn't a full path (such as a quoted `"~/.halonic"`) and when a run can't copy a workspace folder or file it may not read, instead of saying it ran into a problem it can't explain yet.
