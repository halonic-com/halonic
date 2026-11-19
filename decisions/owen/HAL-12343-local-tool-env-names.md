# Decision: Halonic's own variables stay Halonic's in a local tool's environment

- Approval: Paperclip task HAL-12343; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LkeCLnoL/E9UU8V5rWFAs6Aur+KEG3kKRDLKnbkzJRVT/9YeLB8M/S/d0lMRU/ZulaiwHZQvTPbTWxFcU4gQBA==

A local tool's `env` could name `HOME`, `PATH` or a temp folder variable, and a secret of that name was set after Halonic's own variables, so it replaced the tool's home or temp folder. Halonic sets these itself, inside the session.

- The plugin check refuses `HOME`, `PATH`, `TMPDIR`, `TEMP` and `TMP` as a local tool's `env` names, with the code `env-reserved`.
- `localToolLaunch` sets the tool's settings first, then its secrets, then Halonic's own variables, so Halonic's values win even if a plugin got past the check.
- For a pinned package the secrets go in before the launcher's own folder and registry variables; `checkPinnedLaunch` already refuses a pin whose secrets set `PATH` or `HOME`.

## Covers

- connector-stdio-sandbox.local-tool-profile
- format.plugin-checks
