---
"@halonicjs/app-studio": patch
---

`halonic run`, `halonic runs send` and Studio's Run now refuse a workflow for the same errors, those in its own file, the agents and workflows it uses and the workspace files every run needs, such as providers and `workspace.yaml`, and the refusal names the files, such as "Acme has 1 problem in providers/mock.yaml."
