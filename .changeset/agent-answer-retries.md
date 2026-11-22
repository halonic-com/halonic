---
"@halonicjs/app-studio": patch
---

An agent file can set `answerRetries: 1`, so a workflow step asks the agent once more when its answer isn't the JSON or one of the options its output asks for, instead of failing the run.
