---
"@halonicjs/app-studio": patch
---

`halonic trust --remove` in a plugin's folder signs the plugin out also when its trust record can't be read, and a plugin that can't be read says when it had no trust to remove.
