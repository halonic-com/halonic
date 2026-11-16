# Decision: Windows check says setup-conflict for an srt install with loopback open

- Approval: the task asks for this change (HAL-5398, from the HAL-3776 spike verdict and the HAL-5407 security review); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FVdbYpU6dycNZDTUV44Y1/2Nlz7PJVAKGVR+sBeaqiPvADLxrZA7OWp2PX2K63ifwpObZyQf5M62g9egH2fMCQ==

## What changes

- The requirement `sandbox-srt.check` gets one more Windows reason: `setup-conflict`, for an srt install whose loopback mode isn't the closed one Halonic needs. `setup-needed` stays for everything else that blocks.
- The adapter's machine seam asks `windowsSandboxState()` (`ok`, `setup-needed`, `setup-conflict`) instead of `hasWindowsSandbox()`.

## Why

Another program may have set srt up with loopback open. Running the setup again would not change that, and Halonic doesn't change a machine-wide mode itself, so it names the conflict and opens no session.

## Tests

Adapter tests cover all three states. The agent-host test double follows the new seam. The Windows path itself runs on Windows CI only.

## Covers

- sandbox-srt.check
