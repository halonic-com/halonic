---
"@halonicjs/app-studio": patch
---

A run that stops on the workspace's own setup now says what is wrong and how to fix it, instead of "Halonic can't tell the cause yet" and a bug report link: a model whose provider the workspace doesn't have, for-each items that aren't a list, a step with no transition for its event, a task step with no agent, and an answer that isn't the JSON its step asks for.
