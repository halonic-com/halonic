---
"@halonicjs/profile": patch
"@halonicjs/adapter-sandbox-srt": patch
---

On Windows the runner's private temp folder is made in the account's own folder directly in `%ProgramData%` (named by a hash of its SID), outside the user's profile folder, so the path the runner sees (its working folder, `TEMP` and `USERPROFILE`) no longer holds the account name. Because every account can read `%ProgramData%`, a folder that is already there is used only when this user owns it and it holds exactly one entry, for this user; otherwise the temp folder is made in the profile folder as before, and one line is logged.
