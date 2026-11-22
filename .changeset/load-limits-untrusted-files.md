---
"@halonicjs/app-studio": patch
---

Checking a workspace stays fast on very large or malformed files: a file reports its first 100 problems and how many more it has, and a connector whose program arguments hold too much text to check for the paths they name is refused with a message that says how to fix it.
