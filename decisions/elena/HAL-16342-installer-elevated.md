# Decision: the Windows installer's take-back runs only without administrator rights

- Approval: the task asks for this change (HAL-16342); Liam approves and signs this note in its security review
- Kind: user-visible

`studio.installer-take-back` now applies when the installer runs without
administrator rights. With those rights the installer starts nothing from the
install folder, which the user can write, except the signed helper it holds
open while Windows starts it (`studio.installer-elevated`).

## What changes

- The take-back requirement says "without administrator rights". Its test and
  its Windows test (`test-take-back.ps1`, a standard user) are unchanged.
- With administrator rights the take-back is skipped. It already took nothing
  back then (the host answers `elevated`), so no computer loses a take-back.

## Why

An installer with administrator rights that starts the agent host from a
folder the user can write runs whatever was put there with those rights.

## Covers

- studio.installer-take-back
