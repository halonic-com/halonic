# Decision: the MXC box gets SYSTEMROOT and LOCALAPPDATA

- Task: HAL-3655
- Approval: Liam approves this note in review on the review task of HAL-3655
- Kind: internal

## What changes

`packages/adapters/sandbox-mxc/requirements/box-request.md`: the box's environment is still only
the profile's variables, `TEMP` and `TMP` as the temp folder and the Node flags, and now also
`SYSTEMROOT` (the host's Windows folder) and `LOCALAPPDATA` (the temp folder) when the profile has
none. The code and its tests change to match.

## Why

The first run of the fence tests on a real Windows 11 Arm computer showed that MXC refuses to start
a box whose environment lacks `SYSTEMROOT` and `LOCALAPPDATA`, and that Winsock needs the real
`SYSTEMROOT`. `SYSTEMROOT` is no secret. `LOCALAPPDATA` is the temp folder, so the box learns
nothing of the user's profile folder. Nothing else of the host's environment is passed.

## Tests

No test was weakened or skipped. One expectation gained the two variables, and a new test covers a
profile that brings its own, in any letter case.

## Covers

- sandbox-mxc.box-request
