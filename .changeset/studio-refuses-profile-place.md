---
"@halonicjs/app-studio": patch
---

Studio doesn't open a folder that holds your profile folder because a variable such as `HALONIC_HOME` moved it there, or a folder inside your profile folder, as the CLI already refuses them.
