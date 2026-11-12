# Decision: sandbox-mxc starts the program on its read-only copies

- Approval: Liam approves this note in review on [HAL-8066](/HAL/issues/HAL-8066)
- Kind: internal
- Task: HAL-8066

## What changes

- `sandbox-mxc.read-only-files` now also says that the session starts the program on the copy: in
  the command given to `start`, a read-only file named as the program, as an argument or as the
  value of an option (`--allow-fs-read=<path>`) is replaced by its copy.

## Why

HAL-7841 copied each read-only file into the box folder and left the program's command to the
host, in `runner-profile.ts` and `harness-profiles.ts`. Those build the profile before the session
exists, so they can't know the copy's path; the host would need the copy after `open`, and the
session port has no member for it (adding one is a breaking change of the `Sandbox` port and needs
an ADR). Replacing the path in the session itself keeps the port as it is, covers every host with
one rule, and leaves `runnerCommand` and the harness commands unchanged.

Limit: only a whole argument, or the value of an option written `-x=<path>`, is replaced. A path
inside a longer argument stays as written, so a program that builds a path from the file's folder
still reads the original and is refused.

## Covers

- sandbox-mxc.read-only-files
