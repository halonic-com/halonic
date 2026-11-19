---
"@halonicjs/engine": patch
"@halonicjs/host-harness-host": patch
"halonic": patch
---

An agent set to "On this computer" gets its bridge on a loopback port, which a program started without a fence can reach, while a sandboxed agent keeps its bridge on a Unix socket on Linux and macOS. The engine's `HarnessBridgeHost.open` now takes where the agent runs (`sandbox` or `this-computer`), and `harnessHostOf` and `LocalBridgeHost` take an optional bridge server for agents on this computer.
