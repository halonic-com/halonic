# Decision: the `halonic` command runs a local integration without the sandbox with the yes given in Studio

- Task: HAL-15144
- Approval: Liam approved the plan on HAL-15144 (https://paperclip.halonic.com/HAL/issues/HAL-15144#document-plan) with four conditions, after his option B on HAL-3384 part 6. It builds the board's approved "Runs" line decisions on HAL-1949 (R-D1 A, R-D3 A), microcopy 24.1 R18 and R19, and Julian's condition (a) in the design on HAL-1873, section 11.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qSLFr6YDPQRy49A+IFOnZODtgrdrHg5uprBODJR8n4v3hrgOJw4Km1d7oc/Ievq+sgtrXgWAw0o70jFR7snlAA==

## What changes

- `cli.no-unfenced-run-yes` (HAL-12639) is narrowed to plugin backends. "local integrations and" goes from its sentence, its example keeps only the plugin backend, and its source names the new requirement. Its test keeps its plugin half unchanged: a plugin backend with a yes for the current reason still answers `needs-yes`, starts nothing and leaves the file as it was. Its integration half moves to the new requirement `cli.local-integration-unfenced-yes` with the opposite expectation, so the test makes fewer `expect` calls; no check is weakened, each one now runs where its rule lives.
- The new `cli.local-integration-unfenced-yes`: a local integration starts in the launcher's sandbox only with the yes saved in the profile's `unfenced-runs` folder for the reason at this start, read at every start; no yes, a yes for another reason or one that can't be read starts nothing; a Take back in Studio stops a running one at the next read; R18's warning goes to stderr once per run.

## Why

The workspace trust check (HAL-3384 part 6) can only offer R5's checkbox for integrations once something honours the yes. Studio starts no local integration, so the command must (R18, R-D3 A).

**No check for Studio's install** (Liam's decision on HAL-15144). The yes in the profile is the signal: only Studio's agent host writes it, behind the launch token, and only for the reason that holds right then. On a computer without Studio nobody can give it, so R19 holds by itself. A check for the install would differ on every platform, be easy to fake (a marker is just another file in a writable place) and add no protection: whoever can write the profile can already write the trust records next to it, so a yes written by hand is no wider an exposure than a trust record written by hand. Julian confirms this in his security review.

**The command only reads the yes** (Liam's condition). Its store refuses to save. It passes a removal through, because the start gate removes the yes when the computer passes the sandbox check, so a later failure asks again (`app.unfenced-runs`); that only ever takes a yes away. A broken yes file blocks the start and the error names the file.

**Plugin backends stay out** (Liam's decision): they get their own gate with `noUnfencedRunConsent`, sharing the integrations' sandboxes.

## Covers

- cli.no-unfenced-run-yes
