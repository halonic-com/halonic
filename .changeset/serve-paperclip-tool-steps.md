---
"@halonicjs/app-studio": patch
---

`halonic serve` connects a new built-in connector, `transport: { paperclip: { connection: <name> } }`: a workflow's tool steps read the PR watcher's last pass and wake or finish a Paperclip task through one of the workspace's Paperclip connections, with the key stored on the server. With no stored key, the step fails with `signed-out`.
