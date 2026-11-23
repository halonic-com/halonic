# Decision: CI checks that an installer with a publisher starts no unsigned helper

- Approval: the task asks for this change (HAL-16540, a follow-up from the security review of #5272); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:EEkZTCHnT+Zj7xeoJ+QloEkCHm9KIid6QDUViixIaGq2PmGzf1TBJ2uxzV8VKDM13luKdPypYh1GB01jrRpGBw==

## What changes

- The Windows installer job in `ci.yml` gets one more step, after the take-back step: `test-unsigned-helper.ps1`.
- The script packs CI's build again with `HALONIC_SANDBOX_SIGNER=Halonic` and `HALONIC_HELPER_SIGNED=yes`, but keeps the helper unsigned. It first checks that the packed helper really is unsigned.
- Running elevated, it checks that the install's pages end with "The setup stopped: the sandbox helper isn't signed by Halonic", a silent `/S /SANDBOX=1` install creates no srt-sandbox account, and the uninstaller with a sandbox set up stops with the same reason and leaves the sandbox in place.
- `build-installer.ps1` and the installer are unchanged.

## Why

The installer's helper signature check (`HelperSigner`, `!ifdef SANDBOXSIGNER`) is compiled only by a signed release build, so CI never packed or ran it. Now every pull request runs it.

## Tests

The step itself is the test; its first run on #5470 passed.

## Covers

- .github/
