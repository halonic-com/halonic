---
"@halonicjs/app-studio": patch
---

On Windows, when the last sandboxed run in a workspace ends, Halonic now also removes the empty folders and files the sandbox made for settings such as `.yarn/releases` and `.claude/settings.json`, so they no longer show up in `git status`. A folder that was there before, or that holds anything else, stays.
