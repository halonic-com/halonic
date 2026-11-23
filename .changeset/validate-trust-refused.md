---
"@halonicjs/app-studio": patch
---

`halonic validate` now reports a connector or provider file whose address has a user name or password in it, and `halonic trust` now refuses such a file with "the address has a user name or password in it" instead of "the URL has user info".
