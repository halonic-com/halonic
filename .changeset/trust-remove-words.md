---
"@halonicjs/app-studio": patch
---

When removing trust fails because Halonic can't write to its data folder or the desktop app didn't answer, Studio now says so in plain words with Copy details for the raw error, and `halonic trust --remove` says when there was no trust to remove.
