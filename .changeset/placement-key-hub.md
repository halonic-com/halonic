---
"@halonicjs/app-studio": patch
---

An agent's "On this computer" choice now belongs to the agent in its own hub: two hubs in one workspace with an agent of the same id no longer share it, so choosing for one never takes the other out of its sandbox. A choice made before this change counts as not made, and the agent runs in its sandbox until you choose again.
