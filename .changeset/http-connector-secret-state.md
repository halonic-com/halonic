---
"@halonicjs/app-studio": patch
---

The page of a connector over HTTP that needs a secret now says that Studio can't tell whether it's set, that `halonic run` and `halonic routines watch` use it, and that setting `HALONIC_SECRET_<NAME>` works too.
