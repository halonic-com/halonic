# Decision: a new sandbox reason code for Halonic's WSL distro without its runtime

- Approval: Paperclip task HAL-15132, from the team decision on HAL-14642 (option 1, once repair covers it) and HAL-14644; Liam signs this note in review on HAL-15132
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:va5pOWhq2ffONwg4dxNrUFymCEU23T6F8qOFIIbygXyIUvDC2TXYHf3olzPQJOvTUruMuxMWyhYj20dx3ZOIDw==

The `Sandbox` port's closed list of reasons gains `runtime-missing`, right
after `distro-missing`, and the port goes to version 10
(docs/adr/2026-11-21-sandbox-reason-runtime-missing.md). It means Halonic's
WSL distro is imported but the runtime that runs the sandbox in it isn't
installed; repair (the setup run again) installs it without importing the
distro again, since HAL-14644. Studio and the CLI word it as "Halonic's own
Linux system for the sandbox is installed, but its setup didn't finish.", with
the fix of `distro-missing` (Settings in Studio, WSL 2 in the CLI), and
Settings › Agent sandbox shows it as Needs repair.

The requirements change only by adding:

- `ports.sandbox-check-reason`: the list of codes gains `runtime-missing`, and
  an example for it.
- `app.sandbox-start-words`: the example for the fixes that point to Settings
  names `runtime-missing` too.
- `sandbox-srt.wsl-runtime`: a failed runtime step now says which port reason
  it gives (`runtime-missing` when the distro has no current runtime, `other`
  when it keeps another version), with an example for each. Before, both gave
  `other`, which the requirement didn't say.

No test is removed or skipped. The test that pinned the port at version 9
for `setupAgain` now says "since version 9", with the same one `expect`.

## Covers

- ports.sandbox-check-reason
- app.sandbox-start-words
- sandbox-srt.wsl-runtime
