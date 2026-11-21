---
"@halonicjs/app-studio": patch
---

An error in another workflow's file no longer stops `halonic run` or `halonic runs send`: the CLI and Studio's Run now refuse a workflow only for errors in its own file, in the agents and workflows it uses, or in files every run depends on, and the refusal names those files, such as "Acme has 1 problem in providers/mock.yaml."
