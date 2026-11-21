---
"@halonicjs/app-studio": minor
---

`halonic run --json --follow` prints JSON Lines for a live run: one `{ outputVersion, event }` line for each event as it happens, then one last line with the result, `{ outputVersion, ok, run }`, or the error. `--json` alone still prints one document.
