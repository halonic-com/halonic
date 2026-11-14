# Decision: the Windows network capture names the process of every connection with ETW

- Task: HAL-8700 (for HAL-7050, the 0.1.0 release candidate; builds on HAL-8688)
- Approval: HAL-8720 (decided by Liam: ETW instead of a host list) and the review on HAL-9003; Liam approves this note in review and signs it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:l/8XC1Vbmwgnj20T20XVeg9xnBKlyo9ZbA1mbDyTCPlg6dTdHGTqKTDRCfXFu6jyG7Jm6C9FK33IBM+NchqoBg==

## What changes

`capture.ps1` starts two ETW sessions with `logman` before pktmon (Microsoft-Windows-Kernel-Network and Microsoft-Windows-Kernel-Process) and turns them into `net.xml` and `proc.xml` with `tracerpt` after it; all three tools ship with Windows. `report.mjs` matches each packet to an ETW flow first (same protocol and endpoints, either direction, ports as logged or byte-swapped), which names the process even for a connection under 0.2 s; the `netstat` samples are only the fallback. The ETW reading lives in `windows/etw.mjs`. The process tree comes from ETW process starts plus the samples. A program counts as Halonic when its image is the installer or lies in the install folder (ETW logs NT paths, so the drive is ignored) or when its parent does.

Self-test: after the idle time the script copies `curl.exe` into the install folder as `halonic-selftest.exe` and fetches http://example.org/ once (under 100 ms). The job fails unless at least one packet of that connection was matched through ETW and named Halonic; the count of packets only ETW could attribute is reported for information. Only the self-test's own process (same name and pid) in its own phase skips the "not the update check" rule, so no other program with that name, at any other time, can hide traffic.

Fail rules: a Halonic connection to a host that isn't GitHub fails, as before. Packets no source can attribute fail the job above 2 % of IP packets; the first real run (run 43486581719) left 3 of 4,834 (0.06 %), so 2 % has room and stays.

## Why

A host list can't prove that only Halonic's update check leaves the machine, because it must let through the CDN and Microsoft hosts Halonic could also reach; three runs gave three different host sets. Only the process settles it.

## Tests

`report.mjs` ran on a hand-built pcapng with ETW XML: the self-test connection was attributed through ETW alone, a Halonic connection to an unknown address failed. The Windows job ran on this branch (run 43486581719): ETW attributed the 21 self-test packets as Halonic, and 0.06 % of IP packets were unattributed. The job still has to be run again on the new head.

## Covers

- .github/
