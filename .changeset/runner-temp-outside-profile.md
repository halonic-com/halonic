---
"@halonicjs/profile": patch
"@halonicjs/adapter-sandbox-srt": patch
---

On Windows the runner's private temp folder is made in `%ProgramData%\halonic\runner-temp`, outside the user's profile folder, so the path the runner sees (its working folder, `TEMP` and `USERPROFILE`) no longer holds the account name. Because every account can read `%ProgramData%`, each account gets a folder of its own there (named by a hash of its SID) that only it may use, and a link or a folder another account owns is refused.
