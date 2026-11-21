---
"@halonicjs/app-studio": patch
---

The harness host writes a request its bridge failed without naming the reason to the run log as `bridge.failed`. `LocalBridgeHost` and `harnessHostOf` take a required `reportError`, which hears of such a failure when the run log can't take it.
