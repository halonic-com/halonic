---
"@halonicjs/app-studio": patch
---

When Studio refuses a git change because it would skip one of your own git filters, such as git-lfs, in a workspace you haven't trusted, the message now says to press Review in the header to trust the workspace and try again, instead of sending you to a terminal.
