# Decision: a manual network capture of a CLI session on Linux and macOS

- Task: HAL-6494 (follow-up from HAL-6488, whose check was a libc-level trace without a packet capture)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-6494](/HAL/issues/HAL-6494)
- Kind: internal

## What changes

A new workflow, `.github/workflows/network-capture.yml`, and its scripts in `.github/probes/network-capture/`. It runs by hand only (`workflow_dispatch`), with read-only rights and no secrets, on `ubuntu-24.04` and `macos-15`. It publishes nothing; it uploads the capture and a host list as artifacts.

Each leg runs tcpdump while the CLI runs the same session as HAL-6488 from a clean home folder (init, init --example acme, validate, trust, doctor, test, routines, run on the test model, runs, schema, a run against a local OpenAI-compatible stub), then stays idle for 10 minutes. The job fails on any packet of the session that isn't loopback:

- On Linux the session runs in its own network namespace, so every packet in the capture is the CLI's.
- On macOS tcpdump tags each packet with its process. Packets of the CLI's process tree fail the job; everything else is listed for review.

A control fetch of example.com from the session must show up in the capture, or the job fails, so an empty capture can't pass.

WSL2 has no hosted runner. It uses the Linux kernel's network stack, so the Linux leg covers it.

## Why

HAL-6488 could only trace connect and DNS calls in our container, which has no root, tcpdump or network namespaces, and we had no macOS machine. A packet capture on the hosted runners closes that gap.

## Tests

Both legs ran on this pull request through a temporary `pull_request` trigger (dropped before review) and passed: 0 packets from the CLI left the machine, and the control fetch was seen on both.

## Covers

- .github/
