---
"@halonicjs/app-studio": patch
---

An agent file can set `answerRetries: 1`, so a workflow step asks the agent once more when its answer isn't the JSON or one of the options its output asks for, instead of failing the run; such an agent's JSON is also found inside an answer with text around it, and the run log keeps the whole answer it couldn't use.
