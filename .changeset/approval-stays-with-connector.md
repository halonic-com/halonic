---
"@halonicjs/app-studio": patch
---

A tool call you approve in a run only ever goes to the connector the approval named, and `halonic run --event` and `halonic runs send` no longer answer a different approval when the one they saw was answered somewhere else first.
