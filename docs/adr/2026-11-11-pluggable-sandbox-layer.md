# Pluggable sandbox layer: one choice, several backends, srt in WSL first on Windows

- **Status:** Proposed
- **Date:** 2026-11-11

## Context

Halonic runs agents only inside a sandbox it trusts. Today `core/app` chooses
between two backends, `srt` and `mxc` ([MXC sandbox backend](2026-11-10-mxc-sandbox-backend.md)),
and on plain Windows srt always answers `windows`, so most Windows people have
no sandbox. Phase 5 (HAL-3288) gives every platform a sandbox, chosen by the
person in a first-start onboarding (board, option A), with more backends to
come: srt inside Halonic's own WSL distro, Docker Sandboxes and a cloud
sandbox. The technical design is on HAL-3779 (sections 2 and 3).

The Windows default depended on a spike (HAL-3775, HAL-3776, srt 0.0.81 on
`windows-2025`). Its verdict: **native srt should not be the Windows
default.** A program in the native sandbox can look up any name, because the
Windows DNS Client service makes the lookup for it, outside srt's network
filter, so data can leave in the names. The spike also found that the WSL
service answers sandboxed programs and that `wsl.exe` can't be denied (srt
refuses to deny files owned by TrustedInstaller), that a session can read every
folder the Users group can read, including earlier sessions' project folders,
and that a deny one session puts on another project folder stays on that
folder and breaks its next session. Tools on Windows' own TLS stack (Schannel)
fail inside it.

We looked at keeping one `srt` backend with a "WSL" setting (the two have
different setup, failure reasons and file locations, and Studio must show them
side by side), at falling through to the next backend when the chosen one
fails (it runs work in a fence the person didn't pick), and at putting the
backend list and its limits into the port (they are facts about Halonic's
backends, not something every adapter must implement).

## Decision

### One choice service with a list of backends

**`SandboxChoiceService` in `core/app` takes a list of backends** instead of
two. Each is a `SandboxBackend`:

- `id`: one of `srt`, `srt-wsl`, `mxc`, and later `docker-sbx` and `cloud`;
- `offered()`: whether this computer offers it at all. A backend that isn't
  offered isn't shown and isn't checked;
- `sandbox`: the `Sandbox` port (`check`, `open`, `capabilities`);
- `canary`: the trust check's probe set. **Every backend has one**, not only
  MXC, and the onboarding ends with this check on every platform;
- `limits`: a fixed list of limit codes, what this backend does not protect
  (below);
- `setup`: what it needs done once, as a code: `none`, `admin-prompt`,
  `admin-install-restart` or `sign-in`.

| Id | What it is | `files` | `strength` | Status |
| --- | --- | --- | --- | --- |
| `srt` | srt on this computer: Seatbelt (macOS), bubblewrap (Linux), sandbox account and WFP (Windows) | shared | `os` | macOS and Linux default; on Windows experimental |
| `srt-wsl` | srt (bubblewrap) inside Halonic's own WSL 2 distro | shared | `os` | Windows default |
| `mxc` | Microsoft's process container, Windows 11 client | shared | `os` | Opt-in until the real-PC check (HAL-2546) |
| `docker-sbx` | Docker Sandboxes (`sbx`) | copied | `vm` | Later, after the board's account-trial decision |
| `cloud` | A remote sandbox | copied | `remote` | Later, off by default, after that decision |

`srt-wsl` is its own backend, not a setting of `srt`. Its port strength stays
`os`: the fence is bubblewrap. That it also sits inside a VM is a fact the
choice reports, not a new strength.

### The setting, and the person's choice is final

One setting replaces MXC's `on`/`off`, saved per computer and per operating
system user through a new `SandboxSettingStore` port (fs-node and memory
adapters):

```ts
type SandboxSetting =
  | { backend: SandboxBackendId; chosenAt: string }
  | { backend: "none"; chosenAt: string; appVersion: string }
  | null; // not chosen yet
```

The service resolves it like this:

1. **A backend id:** run that backend's `check()` and trust check. Passed:
   it is `active`. Failed: `active` is `null`, with that backend's state and
   reason. **Halonic never switches to another backend by itself.** Agent
   steps don't run, and Studio shows the fix and the other options. This is
   the rule the MXC record set, now for every backend.
2. **`none`:** `active` is `"none"`, the remembered "continue without a
   sandbox" choice. Only a person makes it, in the onboarding or Settings
   ([sandbox without a fence](2026-11-11-sandbox-without-fence.md) for the
   launcher, HAL-3779 section 7 for the ask mode).
3. **`null`:** Studio runs the onboarding. The CLI and headless runs, which
   have no onboarding, try the platform's default list in order, use the first
   backend that passes and say which one. The CLI never picks `none` and never
   picks an experimental backend by itself.

A failed trust check keeps that backend off until the next start. A session
whose fence proof is `not-fenced` starts a new trust check, for every backend.

### Default per platform

| Platform | Recommended in the onboarding | Other options | CLI and headless order |
| --- | --- | --- | --- |
| macOS | `srt` | `docker-sbx`, `cloud` | `srt` |
| Linux | `srt` | `docker-sbx`, `cloud` | `srt` |
| Windows | `srt-wsl` | `srt` (experimental), `mxc`, `docker-sbx`, `cloud` | `srt-wsl` |
| Inside a container | none fits (`container`) | `cloud` | none |

The lists are constants in `core/app`, like `mxcDefault` today. `mxc` joins
the Windows CLI order only when `mxcDefault` becomes `"on"`. If a later spike
clears native srt on Windows, changing its default is a change to these lists
and to this record, nothing else.

### What Studio, the CLI and `doctor` get: codes

```ts
interface SandboxChoice {
  active: SandboxBackendId | "none" | null;
  backends: Array<{
    id: SandboxBackendId;
    offered: boolean;
    experimental: boolean;
    state: "in-use" | "available" | "setup-needed" | "check-failed" | "not-available";
    reason: SandboxUnavailableReason | TrustCheckFailure | null;
    limits: LimitCode[]; // static, from the backend
    residuals: LimitCode[]; // seen by this start's trust check
  }>;
}
```

No sentences: Studio words every state, reason and limit code from the
approved design. A new state or code is a change to `core/app` through a task
that names it, with its words in the design first.

### Limit codes live in `core/app`

**What a backend doesn't protect is a closed list of `LimitCode`s in
`core/app`, next to the backends, not in the port.** They are facts about the
backends Halonic ships, and no adapter has to report them. A backend lists its
static limits. The trust check adds residuals it saw at this start. The first
list:

| Code | Meaning | Static on |
| --- | --- | --- |
| `project-folder-writable` | The agent can change and delete anything in the project folder | every backend |
| `name-lookups-leave` | Name lookups go out through a system service, so data can leave in the names | `srt` (Windows), `mxc` |
| `wsl-service-reachable` | The WSL service answers sandboxed programs, and `wsl.exe` can't be denied | `srt` (Windows) |
| `user-files-readable` | The sandbox reads whatever the Users group can read, unless a path is denied | `srt` (Windows) |
| `kept-roots-readable` | Every sandboxed session on the computer can read every project folder srt has kept a grant on | `srt` (Windows) |
| `schannel-tls-fails` | Tools on Windows' own TLS stack fail (`curl.exe`, PowerShell web calls, `dotnet restore`) | `srt` (Windows) |
| `files-leave-machine` | Project files are copied to another machine | `cloud` |
| `no-file-fence`, `no-network-fence` | Nothing is fenced | `none` |

Residuals the Windows trust check can add, from `srt-win wfp verify`:
`anonymous-loopback`, `deny-only-user-sid`, `lowered-integrity-unprobed`.

### Native srt on Windows (experimental)

- **`check()`** asks srt's own dependency check and answers `ok`,
  `setup-needed` or `setup-conflict`, not `windows`.
- **Installed without the profile read grant** (`windows-install
  --skip-profile-grant`, as CI already does). The tool folders under the
  profile that the harness needs (from its PATH) go into `readOnlyPaths` at
  session start, never `AppData` as a whole. The trust check's `too-strict`
  control catches a missing one.
- **Loopback stays closed** (no `--allow-loopback`). The bridge is reached
  through srt's proxy. A machine-wide setup made another way is
  `setup-conflict`; Halonic never changes it.
- **Halonic doesn't deny other projects' folders.** The spike showed the deny
  stays on the other folder and breaks its next session. Kept grants are a
  static limit (`kept-roots-readable`) instead. The kept grant is Modify for
  the whole sandbox group, but the spike only tested reads from another
  session. Writes from another session are most likely stopped by srt's
  write-restricted token, but that is untested until the probe in HAL-5432
  answers. If it shows writes go through, this limit becomes
  `kept-roots-writable`. Halonic records every folder
  it granted, removes the grant (`srt-win acl forget`) when a project is
  removed, and removes them all on uninstall and in "Remove sandbox setup".
  The working folder is always the project folder itself, never a parent of
  several projects.
- **Deny rules name folders, not file globs.** srt on Windows expands globs
  once, at session start, so a file created later isn't covered; a folder deny
  covers it. A contract test fails on a Windows profile with a glob outside a
  short allowed list.
- **`wsl.exe` stays reachable** (`wsl-service-reachable`). Halonic's distro is
  registered for the person's own Windows account, which the sandbox account
  doesn't see, so it can't be started from inside. Whether the sandbox account
  can register a distro of its own is open (HAL-3776 follow-up).
- **`runner-fence.ts` keeps win32 as `not-fenced: windows`** for plugin and
  integration code. Native srt fences agents only, because the network fence
  doesn't hold. Opening it to plugin code is Julian's security call, on a task.

### Port version 6: new reason codes only

New failure causes are new `SandboxUnavailableReason` codes, and the list is
closed, so this is a breaking port change
([port list and versions](2026-11-07-port-list-and-versions.md)):
`sandboxVersion` goes from 5 to 6. Nothing else in the port changes. The new
codes:

| Code | Meaning | Returned by |
| --- | --- | --- |
| `not-supported` | This edition or build of the operating system can't run the backend | `srt-wsl`, `docker-sbx` |
| `blocked-by-policy` | A company policy blocks the backend | `srt`, `srt-wsl`, `docker-sbx` |
| `virtualisation-off` | Hardware virtualisation is off, or a VM has no nested virtualisation | `srt-wsl`, `docker-sbx` |
| `wsl-missing` | WSL isn't installed (needs admin) | `srt-wsl` |
| `restart-needed` | WSL is installed, but Windows must restart first | `srt-wsl` |
| `distro-missing` | WSL works, but Halonic's distro isn't imported (no admin needed) | `srt-wsl` |
| `setup-conflict` | The machine-wide setup belongs to another program or is set up another way | `srt` (Windows) |
| `setup-needed` | The one-time admin setup isn't done, or was done by another release of the backend | `srt` (Windows) |
| `sign-in-needed` | The backend needs an account sign-in | `docker-sbx`, `cloud` |

`sign-in-needed` comes now, so Docker Sandboxes and cloud don't need a
version 7. `windows` stays, narrowed to "this backend has no Windows mode"
(MXC not offered, old adapters).

The rule that the first applicable reason wins, because its fix comes first,
stays. The full order in version 6 is: `windows`, `container`,
`not-supported`, `blocked-by-policy`, `virtualisation-off`, `wsl-missing`,
`restart-needed`, `distro-missing`, `setup-conflict`, `setup-needed`,
`user-namespaces-restricted`, `bubblewrap-missing`, `linux-tools-missing`,
`sign-in-needed`, `other`. What Halonic can't fix comes before what an admin
can, and that before what the person can do in one step.

## Consequences

- Windows people get a real network fence by default, in exchange for a
  one-time WSL setup that may need an admin and a restart. Those who can't
  install WSL see the reason and the other options, never a silent fallback.
- Adding `docker-sbx` or `cloud` later is an adapter plus a list entry in
  `core/app`, with no port change.
- MXC moves into the list: its setting folds into `SandboxSetting`, and its
  states become the general ones. Its gate (the real-PC check on HAL-2546)
  stays.
- Every backend now needs a canary and a trust check, which makes starting
  Halonic slower on macOS and Linux by one short session.
- These keep the decision true:
  - Choice unit tests with fake backends: a failed chosen backend never makes
    another one `active`; the CLI never picks `none` or an experimental
    backend; the default lists per platform.
  - A type test fails on an unlisted state, reason or limit code.
  - The port's contract suites and type test cover the version 6 reason list,
    and every sandbox adapter is updated in the same change.
  - The Windows profile glob contract test, and a fence test that creates a
    matching file after the session starts.
  - The HAL-3776 probes stay in the Windows fence job and run on every srt
    bump, so a change in srt's Windows behaviour shows up before it ships.
- The WSL path itself (projects inside the distro, the image, the setup state
  machine, the engine over `wsl.exe` standard input and output) is in
  HAL-3779 sections 5 to 7 and gets its own records when it is built.

## Changed from an earlier decision

[MXC sandbox backend](2026-11-10-mxc-sandbox-backend.md) chose between srt
and MXC, with MXC's own `on`/`off` setting and its own state list. That
becomes one setting and one state list for every backend. Its no-fall-through
rule and trust check stay, now for every backend. Its Windows order (srt
first, once its Windows mode passes) changes: `srt-wsl` comes first and native
srt is chosen only by the person.
