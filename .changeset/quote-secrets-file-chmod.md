---
"@halonicjs/app-studio": patch
---

The chmod 600 line that `halonic run`, `halonic secret list` and Studio's run page print for a secrets file other users can read now quotes a path with a space, such as macOS's Application Support, so you can paste it into a terminal.
