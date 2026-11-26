# Decision: Microsoft's runtime licence moves from the Windows installer into Halonic's sandbox step

- Approval: HAL-19294, from the board's approval of option A on 26 Nov (design HAL-18894, tech check HAL-18893); Liam approved the PR split on HAL-19294 and signs as the CTO
- Kind: user-visible

The Windows installer becomes progress bar only (HAL-18892): it asks nothing,
so it can no longer show a licence page or a sandbox choice. The board chose
option A: the installer always ships the runtime under its inert name, and
Halonic shows Microsoft's licence with **I Agree** in its own sandbox step,
before the runtime is ever used.

## What changes

- `studio.installer-licence-page` is rewritten. The installer shows no licence
  page in any mode, and copies `vcruntime140.dll.pinned` in every install, not
  only for the sandbox step. Nothing loads a file under that name.
- Halonic's sandbox setup step (first-run window or Settings) shows the same
  `license.rtf`, unchanged and checked against the SHA-256 pinned in
  `vcruntime.json`, with **I Agree**, before it asks Windows for administrator
  rights. Only after **I Agree** does the helper place `vcruntime140.dll`
  beside srt-win. A hash mismatch or no agreement places nothing, and Halonic
  stays usable without the sandbox.
- The uninstaller deletes both the pinned file and the copy beside srt-win.

## What doesn't change

- The licence text is still Microsoft's own, word for word; Halonic adds none.
- The pin, the fetch script and its hash check stay as they are.
- The licence is still accepted before `vcruntime140.dll` can be loaded.

## Why

Board decision on HAL-19294 (26 Nov), option A of the HAL-18893 tech check.
Option B (download the runtime on agreement) would make the sandbox setup
need the internet; option C would bring back an installer page. The rule that
changes is the one from HAL-17810 that installed no file under any name
without the sandbox: the pinned file now sits unused in every install.

## Order

This pull request changes only the requirement. Its tests in
`apps/studio/src/studio/licence-notices.test.ts` still verify today's
installer until HAL-19303 (the sandbox step) and HAL-19305 (the installer)
change the code, each with that requirement's new tests and its own
decision note if the guard asks for one.

## Covers

- studio.installer-licence-page
