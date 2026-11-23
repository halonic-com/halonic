# Decision: the phone's own page may ask whether the owner check can ask

- Approval: Paperclip task HAL-16968 (Liam approved PR 3b of HAL-15194); Liam reviews the PR and Julian signs this note
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:5tKesh75XKBPY0mv6KaLKLwf91oj0Nx/ABEd4YArDcPB/LEiAnJX3VI0Y68RIhu85pP4bhmfGrJTy9EeV0Z+DQ==

The phone page needs to know whether the owner check can ask before it shows Approve and Reject for a risky approval (HAL-15194, PR 3c). Until now no command reported it: no capability grants the owner check plugin, on purpose. The shell gets one new command, `owner_check_available`, and nothing else changes.

- It fails closed: any error, an Android older than 11, a weak or missing biometric, a window on another page, and every desktop answer `false`. It answers a plain boolean, nothing about which biometric is enrolled or why it can't ask.
- Only `capabilities/phone-owner-check.json` grants it: local, the `main` window, Android only. A test reads every capability file and fails if any other one lists it, or if this one names another platform, window or permission. No capability names the plugin's own commands (`owner-check:`), and the served Studio is refused.
- It is a hint for the page only. `tunnel_send` still asks the owner check before it seals each answer, and the host still checks its desktop switch for every answer.
- The page asks again every time the list of approvals arrives, not once at load, because a fingerprint can be removed at any time. That wiring lands in PR 3c with its tests.

## Covers

- studio.src-tauri.owner-check-available-command
- studio.src-tauri.served-page
