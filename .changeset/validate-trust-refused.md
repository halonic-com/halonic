---
"@halonicjs/app-studio": patch
---

`halonic validate` now reports a connector or provider file whose address has a user name or password in it, as `halonic trust` refuses such a file. Trust's own refusal now says "the address has a user name or password in it" instead of "the URL has user info".
