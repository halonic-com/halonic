# Decision: a manual network capture of the Windows installer and app

- Task: HAL-8688 (for HAL-7050, the 0.1.0 release candidate; follows HAL-6494)
- Approval: the task asks for this change; Liam approves this note in review on HAL-8688
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8A/j0hoaRENvhOmYFlHb3UCtOzoFNdKyb5y5XmeIq6DJe0ZeiyXvFzbRgjlxR8f+si73BIUQGqyQ7+Ht6JE+Cw==

## What changes

A `windows` job in `.github/workflows/network-capture.yml` and its scripts in `.github/probes/network-capture/windows/`. It still runs by hand only, with read-only rights and no secrets, and publishes nothing. It uploads the capture, a report and checksums as artifacts.

The job builds the installer from the commit in the `windows_ref` input (default `f73c4ea9`, the release candidate) with `windows/build-installer.ps1`, installs it silently (`/S`), starts `Halonic.exe` and captures with `pktmon` at the network cards through the install, 30 s of first start, the update-check window (120 s after the start), the idle minutes (the same input as the other legs) and a control fetch of example.com. The job's own checkout is the app at that commit; the probe scripts come from a second checkout of the branch the run was started on.

pktmon's packets name no process. `sample.ps1` therefore reads `netstat -ano` every 0.2 s and the process table every second, and `report.mjs` matches each packet to the connection with the same addresses and ports at that time. It sorts the processes into Halonic (the installer, the install folder's programs and what they start), WebView2 (`msedgewebview2.exe`) and Windows and others. DNS goes out from a Windows service, so lookups are in the last group; the report lists every DNS name asked for. The report reads the capture (pcapng, DNS names included) itself, so the job installs no capture tool.

The job fails when a Halonic program sends anything to a host that isn't GitHub (the update check reads `latest.json` from GitHub and follows its redirect to GitHub's asset hosts), when the control isn't in the capture, when the control fails, or when a step fails. WebView2, Windows and unmatched traffic are listed for review and don't fail it.

## What is only checked in the code

Nothing clicks through onboarding, so the capture shows the app on its first screen. What the app sends after each onboarding step, after sign-in or with a configured model provider, and what an update does once found, are read in the code, not captured. 

## Why

The release candidate should show, with a packet capture on a real Windows install, that Halonic sends nothing except its update check. Linux and macOS have this for the CLI (HAL-6494); the Windows app didn't.

## Tests

`report.mjs` ran against a hand-built pcapng, sample and session files: it sorted Halonic, WebView2 and other traffic, found the control and failed on a Halonic connection to a non-GitHub address. The Windows job itself has not run yet; it needs a manual run on the branch, whose result goes on HAL-8688.

## Covers

- .github/

## Addendum (HAL-8700): ETW names the process of every connection

Task HAL-8700, decided on HAL-8720 (Liam): a host list can't prove that only Halonic's update check leaves the machine, because it must let through the CDN and Microsoft hosts Halonic could also reach; three runs gave three different host sets. Only the process settles it.

`capture.ps1` now starts two ETW sessions with `logman` before pktmon (Microsoft-Windows-Kernel-Network and Microsoft-Windows-Kernel-Process) and turns them into `net.xml` and `proc.xml` with `tracerpt` after it; all three tools ship with Windows. `report.mjs` matches each packet to an ETW flow first (same protocol and endpoints, either direction, ports as logged or byte-swapped), which names the process even for a connection under 0.2 s; the `netstat` samples are only the fallback. The process tree comes from ETW process starts plus the samples. A program counts as Halonic when its image is the installer or lies in the install folder (ETW logs NT paths, so the drive is ignored) or when its parent does.

Self-test: after the idle time the script copies `curl.exe` into the install folder as `halonic-selftest.exe` and fetches http://example.org/ once (under 100 ms). The report must find that connection and name it Halonic, and counts how many of its packets only ETW could attribute; if it isn't found the job fails. The self-test's own packets are excluded from the "not the update check" failure rule.

Fail rules: a Halonic connection to a host that isn't GitHub fails, as before. Packets no source can attribute fail the job above 2 % of IP packets; that number is a first guess to be set from a real run and recorded here with the reason.

Tested: `report.mjs` on a hand-built pcapng with ETW XML: the self-test connection was attributed through ETW alone, a Halonic connection to an unknown address failed. The Windows job itself needs a run on a Windows runner.
