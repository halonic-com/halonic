# Decision: the test for ending a program's group on exit doesn't run on Windows

- Approval: a new skip in a test needs Liam's review (plan 9.3); Liam approves this note in review of the follow-up to the launcher start PR on [HAL-983](/HAL/issues/HAL-983)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ifpymu/AXsDqZVoqFm/NXZ/RklZXd2RdkAllBnw6KbHpMl/Qo7eXlNTKopM8IiORkIqvO3/p5/9Pr32spNK0AQ==
- Task: HAL-983

## What changes

- `packages/adapters/sandbox-host/src/host-sandbox.test.ts` gains the test "ends as soon as
  the program does, even when a child it left holds its output open", with `it.skipIf(windows)`.

## Why

The launcher now kills what a program left in its process group as soon as the program exits,
not once its output closes, so a child that holds the output open no longer keeps the program
running until the time limit (Liam's note on #1558).

Windows has no process groups. The launcher stops a process tree there with `taskkill /T`,
which finds children through their parent's id. Once the parent has ended, `taskkill` can't
find it, so a child it left is out of reach and keeps the output open until the time limit.
The README says so. Run on Windows, the test would fail and leave a Node process running on
the CI machine. Nothing on Windows changes in this PR, so there is nothing new to test there.

## Covers

- packages/adapters/sandbox-host/src/host-sandbox.test.ts
