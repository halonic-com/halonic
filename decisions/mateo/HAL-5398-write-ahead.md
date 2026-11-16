# Decision: the sandbox-srt kept-grants requirement gains a write-ahead record of session folders

- Approval: HAL-5398 (https://paperclip.halonic.com/HAL/issues/HAL-5398), approved by the board; the package owner (Liam) signs this note
- Kind: internal
- Task: HAL-5398

## What changes

The requirement `sandbox-srt.kept-grants` now says the adapter writes a session's working and
temp folders to its host process's own record file before srt can grant anything on them, opens no
session when the record can't be written, and lets the sweep forget the recorded folders of host
processes that are gone, wherever they are. It gains four examples. No test was weakened or skipped.

## Why

A host that crashed after srt granted a folder left a write grant that nothing remembered, and the
sweep only looked inside its sweep roots, so that grant stayed for good.

## Covers

- sandbox-srt.kept-grants
