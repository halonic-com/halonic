---
"@halonicjs/profile": patch
---

On Windows the runner's private temp folder is made in `%ProgramData%\halonic\runner-temp`, outside the user's profile folder, so the path the runner sees (its working folder, `TEMP` and `USERPROFILE`) no longer holds the account name.
