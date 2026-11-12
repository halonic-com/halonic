# Decision: a manual network capture of a CLI session on Linux and macOS

- Task: HAL-6494 (follow-up from HAL-6488, whose check was a libc-level trace without a packet capture)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-6494](/HAL/issues/HAL-6494)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bQj/jVwc0QqSF0wHYojchYHA0iwmlPh1adVbj9UhhHTvAPTIsIbFcffOiZHl62LayKIC+CJz0oqQB7NiLnZZCg==

## What changes

A new workflow, `.github/workflows/network-capture.yml`, and its scripts in `.github/probes/network-capture/`. It runs by hand only (`workflow_dispatch`), with read-only rights and no secrets, on `ubuntu-24.04` and `macos-15`. It publishes nothing; it uploads the capture and a report as artifacts.

Each leg runs one tcpdump capture while the CLI runs the same session as HAL-6488 from a clean home folder (init, init --example acme, validate, trust, doctor, test, routines, run on the test model, runs, schema, a run against a local OpenAI-compatible stub). The capture then stays on for 10 idle minutes (the input allows 0 to 30) and ends with a control fetch. The job fails on any packet of the session that isn't loopback:

- On Linux the session runs in its own network namespace, so every packet in the capture is the session's or the control's. IPv6 is turned off in the namespace, so an IPv6 address fails before any packet is sent and doesn't show up in the capture.
- On macOS tcpdump tags each packet with its process id, and the process it was sent for. The session runs in a process group of its own, and `ps` samples every 0.1 s record its process tree: the first process, its group and everything started from those. A packet of any of those pids fails the job, whatever the program is called. A packet of a pid the samples never saw, started after the session began, also fails (a process too short-lived to sample). Other programs are listed for review. DNS on macOS is sent by mDNSResponder. When tcpdump names the process it asked for, the packet counts against that process. When it doesn't, the packet is only listed for review.

The control is a fetch of example.com at the end, inside the same capture, so it shows that the capture was still running after the session and the idle time. Its packets are told apart by its pid on macOS, and on Linux by its start time, its DNS lookup of example.com and its own connection. The capture must hold its DNS lookup of example.com and a SYN to the address it connected to, and that address must be one the lookup returned. Otherwise the job fails. It also fails when the fetch fails, when tcpdump stopped early or dropped any packet, when tcpdump can't read the capture back, when the session leaves processes running, or when any step fails. A trap stops tcpdump, removes the namespace and its firewall rules and writes the report on every exit.

WSL2 has no hosted runner. It uses the Linux kernel's network stack, so the Linux leg covers it.

## Why

HAL-6488 could only trace connect and DNS calls in our container, which has no root, tcpdump or network namespaces, and we had no macOS machine. A packet capture on the hosted runners closes that gap.

## Tests

Both legs ran on this pull request through a temporary `pull_request` trigger (dropped before review) and passed: 0 packets from the CLI left the machine, and the control fetch was seen on both.

## Covers

- .github/
