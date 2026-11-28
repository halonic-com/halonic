---
"@halonicjs/app-studio": patch
---

`halonic run` while `halonic serve` runs: when serve takes the start but doesn't answer in time, run now says the run may have started and points at `halonic runs list`, instead of telling you to stop serve and run again. A trust check that fails in serve now reads "halonic serve couldn't start the run.", and the started line no longer promises a question on your phone.
