# Decision: the Windows installer's take-back runs only without administrator rights

- Approval: the task asks for this change (HAL-16342); Liam approves and signs this note in its security review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nS6Zxubtu7pHyLKzF1ANdFqopecjXZ8Dt1os1ys519/3UpuavHemFFySWtfnAIGYq+Q9hXLVEXspMe07Kh+qAw==

`studio.installer-take-back` now applies when the installer runs without
administrator rights. With those rights the installer starts nothing from the
install folder, which the user can write, except the signed helper it holds
open while Windows starts it (`studio.installer-elevated`). In a signed
release that helper must be signed by the publisher built in, checked through
the handle the installer holds.

## What changes

- The take-back requirement says "without administrator rights". Its test and
  its Windows test (`test-take-back.ps1`, a standard user) are unchanged.
- With administrator rights the take-back is skipped. It already took nothing
  back then (the host answers `elevated`), so no computer loses a take-back.

## Why

An installer with administrator rights that starts the agent host from a
folder the user can write runs whatever was put there with those rights.

## Not covered

`uninstall.exe` itself, and the earlier version's uninstaller the installer
runs before an update, still run from the install folder, as in every per-user
installer. `studio.installer-elevated` says so. An unsigned build (dev, CI and
the unsigned 0.1 releases) checks no signature, as Studio's shell and the
helper check none then.

## Covers

- studio.installer-take-back
