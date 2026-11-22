---
"@halonicjs/app-studio": patch
---

`halonic trust --remove` in a plugin's folder now also signs you out of the plugin's sign-ins when its trust record can't be read, and `halonic trust --plugin <id> --remove` says when a plugin that can't be read had no trust to remove.
