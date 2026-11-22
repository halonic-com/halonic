---
"@halonicjs/app-studio": patch
---

`halonic` now shows control characters in a name or message as their visible codes, such as `\u001b`, and writes the command on a waiting run's "Answer with:" line so you can paste it as it is. A workflow file is now refused when a transition's event isn't lowercase letters, digits, `-` and `_`, starting with a letter or digit.
