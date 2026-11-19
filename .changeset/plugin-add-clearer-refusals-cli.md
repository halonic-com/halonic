---
"halonic": patch
---

`halonic plugin add` now says why it refuses a source in words that point the right way: a commit id cut short asks for the full id, a branch or a tag; `git@host:path` says which `ssh://` address to write instead; an `https://` address with a password and no path says it has a password in it; a missing folder says there's no folder; a manifest problem starts with the field it is about, such as `backend.tools[0].risk:`; and a git wrapper on the `PATH` ends with exit 9 and says to put git itself first on the `PATH`. `halonic tools review` and `halonic tools approve` on a plugin's connector now say when that plugin isn't added, with `halonic plugin add`.
