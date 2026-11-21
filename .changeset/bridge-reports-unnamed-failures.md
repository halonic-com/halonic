---
"@halonicjs/app-studio": patch
---

The harness bridge tells the run about a request that failed for a reason it doesn't name to the program, through the new optional `reportError` of the bridge options, and the OpenAI route refuses an image or file URL given in any form but a `data:` string.
