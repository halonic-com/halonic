---
"halonic": patch
"@halonicjs/app-studio": patch
---

`halonic tools review` and `halonic tools approve` on a plugin's connector now say its tools need no approval, because trusting the plugin covers them, and exit 0 instead of failing. The plugin trust check, in the CLI and in Studio, now says which program gets a program's secret, as which variable, and where that program can connect; the file list is headed "Files".
