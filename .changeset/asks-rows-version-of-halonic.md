---
"@halonicjs/app-studio": patch
---

The CLI trust check no longer says an agent with `asks: in-sandbox` still asks first, since a CLI run in the sandbox answers its calls; Studio's trust review now says "this version of Halonic still asks first", so it can't be read as a version of the workspace.
