---
"@halonicjs/app-studio": patch
---

When trust refuses a connector or provider address with a backslash, a hidden character or no `//` after `http:` or `https:`, it now says so in plain words about "the address" instead of URL terms such as "query" and "scheme".
