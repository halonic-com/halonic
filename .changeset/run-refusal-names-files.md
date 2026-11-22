---
"@halonicjs/app-studio": patch
---

`halonic run`, `halonic runs send` and Studio's **Run** button now refuse a workflow for the same errors: those in its own file, in the agents and workflows it uses, and in the workspace files every run needs, such as providers and `workspace.yaml`. The refusal names the files, such as "Acme has 1 problem in providers/mock.yaml."
