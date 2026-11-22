---
"@halonicjs/app-studio": patch
---

`halonic plugin add` refuses an `https://` git address with a user name in it, so no token given that way is kept or shown by `halonic plugin list`.
