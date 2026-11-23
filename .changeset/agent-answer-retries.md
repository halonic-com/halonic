---
"@halonicjs/app-studio": patch
---

An agent file can set `answerRetries: 1`: when the agent's answer isn't the JSON or one of the options its output asks for, the workflow step asks it once more instead of failing the run. For such an agent, Halonic also finds the JSON in an answer with text around it, and the run log keeps the whole answer it couldn't use.
