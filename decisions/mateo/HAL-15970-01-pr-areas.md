# Decision: a pull request's area jobs come from its own changes, and the Windows installer and update run only for the installer's area

- Task: HAL-15970
- Approval: Liam approves this note in review on HAL-15970
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:X4/iGGVITB+9JcuXoYhEUW676obRk1uU2OQC3819zkDgEe1UxK37vNuzOPE/z7b7Jn/QAgeH4S8s6FU9Fwk2Dw==

## What changes

In `.github/workflows/ci.yml`, the `changes` job ("Changed areas") on a pull request diffs the
checkout against its first parent instead of `pull_request.base.sha`. The checkout is GitHub's
merge of the pull request into the newest `main`, so its first parent is that `main`, and the diff
is exactly the pull request's own change. If the first parent can't be read, it diffs from
`pull_request.base.sha` as before. Merge groups and pushes don't change.

A new area, `installer`, decides the Windows installer, Windows update and WSL runtime jobs
(the WSL runtime only feeds the installer). Before, they ran on the whole `tauri` or `agent_host`
area. The new area is:

- this workflow and `.github/actions/`;
- how the installer is built and what it ships: `apps/studio/src-tauri/windows/`, `binaries/`, the
  Tauri configs and manifest, `Cargo.toml`, `Cargo.lock`, `build.rs`, the Rust toolchain file,
  `apps/studio/package.json` (the Tauri CLI), the agent host's build (`apps/agent-host/package.json`
  and `scripts/`), the WSL runtime packer, srt-win's setup version, the notices code, the root
  `package.json`, `LICENSE` and `NOTICE`;
- the shell code the installer and update tests exercise: `main.rs`, `lib.rs`, the updater
  (`updates*.rs`, `crates/update-state`), the agent host start (`agent_host*.rs`,
  `crates/agent-host`) and the sandbox elevation (`sandbox_elevate.rs`, `crates/sandbox-elevate`,
  `crates/elevate-start`).

On `main`, the hourly macOS and Windows run (HAL-15889) still runs both jobs whatever changed
(every area is on there), so a break that the area misses shows on `main` and the nightly issue
gives the owner a task. Pushes to `main` skip them, as HAL-15889 set.

## Why

The board's aim is pull request checks in about 15 minutes instead of about 30 (HAL-15970). On
#4958 (run 45000358096), which changed only Vitest settings and tests of Studio features, both
Windows jobs ran for 12 to 15 minutes. Its `Changed areas` job said `tauri`, `agent_host`,
`android` and `docs` were on: `main` had merged 11 commits since the pull request's base, among
them `apps/agent-host/` and `apps/studio/src-tauri/` changes, and the three-dot diff from
`pull_request.base.sha` to the merge checkout counted them as the pull request's. Every pull
request that wasn't rebased in the last few minutes ran area jobs for other people's changes.

The old trigger also ran both jobs for any change to the agent host's code or any Tauri crate. In
the 884 merges since 20 Nov, 139 matched it; 82 match the new area. The agent host's code is
built and started on Windows by "Agent host executable (Windows)", and the shell by "Tauri shell
on Windows", so those changes are still tested on Windows on the pull request. CLI packaging
(`tooling/publish/`, the npm tarballs) isn't an input of either job: the installer doesn't ship
the CLI. The lockfile isn't in the area either: a dependency bump that breaks the installer shows
on `main`.

## Tests

No test was weakened or skipped. `tooling/check/src/test/ci-pr-areas.test.ts` runs the real
"Find changed areas" script in a small git repo where `main` moved after the pull request's base;
with the old diff it fails (`agent_host` is on). It also checks the installer area's paths and the
three jobs' conditions. New requirement: `check.ci-pr-areas`.

## Covers

- .github/
- tooling/check/
