---
"halonic": patch
"@halonicjs/engine": patch
"@halonicjs/host-harness-host": patch
---

An agent set to "On this computer" now starts from `halonic serve` and `halonic routines watch` on Linux and macOS. The engine tells the host the run's placement when it opens the bridge, and the host opens it on that placement's bridge server: a fenced run's bridge stays on a Unix socket, and an unfenced run's is on loopback, which the launcher accepts. `harnessHostOf` takes `bridgeServers`, one per placement, in place of `bridgeServer`.
