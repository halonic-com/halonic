---
"@halonicjs/app-studio": patch
---

Workflow files can have a `tool` step (`type: tool`), which calls one tool of a connector with no model, with the same checks and approvals as an agent's call; `halonic validate` checks that it names its connector, its tool and its output, and the Inbox names the step when it waits for your OK.
