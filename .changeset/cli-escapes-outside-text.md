---
"@halonicjs/app-studio": patch
---

`halonic` now shows control characters in a name or message as their visible codes, such as `\u001b`, and writes a waiting run's events so you can paste the Answer with: line as it is. A workflow file is now refused when a transition's event isn't lowercase letters, digits, `-` and `_`, starting with a letter or digit.
