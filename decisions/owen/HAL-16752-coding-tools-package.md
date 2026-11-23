# Decision: three coding tools tests run only where the computer can do what they test

- Approval: Paperclip task HAL-16752, Liam's security review of the coding tools package (23 Nov)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+KzWkBEeusYamzfzYg1sGEcVDFptXWL+OAPmBOpxfe9Pch8T9NM0jEm2saPX5pVQ1mRV9mPwEJps8UdHLrWbBA==

The new coding tools package has three tests that need something not every
test computer has. Each one is skipped only there; no existing test is skipped or
weakened.

- `folders.test.ts`, "refuses a named pipe instead of waiting on it": Windows
  has no named pipes inside a folder (`mkfifo`), so there is nothing to make.
  The refusal of a folder, the nearest case, runs on every platform.
- `own-code-check.test.ts`, "probes every file and folder all the way down,
  and links last": making a file link on Windows needs an administrator.
- `own-code-check.test.ts`, "lets code it can't change start": on Windows and
  when tests run as root, files stay writable whatever their mode, so code
  that can't be changed can't be made there. The refusal of writable code
  runs everywhere.

## Covers

- packages/adapters/coding-tools/src/folders.test.ts
- packages/adapters/coding-tools/src/stdio/own-code-check.test.ts
