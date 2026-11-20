---
"halonic": patch
"@halonicjs/studio-feature-workspace": patch
---

`halonic trust` refuses a word such as `revoke` as wrong usage (exit 2) and suggests `--remove`, instead of trusting the workspace. Settings › Trusted sources now says trust given with the `halonic` command is listed there too, as the desktop and the CLI share one trust list.
