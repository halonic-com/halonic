---
"@halonicjs/app-studio": patch
---

A `HALONIC_HOME` that isn't a full path is now refused in plainer words, on Windows with your own home folder as the example, and `halonic trust --list` and `--remove` say what they were doing instead of "Couldn't trust this folder".
