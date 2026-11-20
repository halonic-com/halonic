---
"halonic": patch
---

A run that stops on the workspace's own setup now says what is wrong and how to fix it, instead of "Halonic can't tell the cause yet" and a bug report link: a model whose provider the workspace doesn't have, for-each items that aren't a list, a step with no transition for its event, and a task step with no agent. They exit 2, or 4 for the missing provider. An answer that isn't the JSON its step asks for, and the other causes Halonic knows, now say their cause after the step.
