# Sandbox check fix data: a refused check may say what fixes it, as data

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

A refused `SandboxCheck` says why with a listed code (v3, v6), and Studio and
the CLI word the fix from it. On Linux the fix depends on the machine: the
package manager that installs bubblewrap, `socat` and ripgrep, and for
Ubuntu 24.04 an AppArmor profile that lets bubblewrap create user
namespaces. Design section 2.6 (HAL-3779) wants the check step to show the
fix for this machine, as one install command for everything that's missing.
Only the adapter knows the machine, and the CLI today guesses "for example on
Ubuntu or Debian" (HAL-5393). The alternative, a table of commands per
distribution in Studio, would need Studio to probe the machine itself.

## Decision

**A refused `SandboxCheck` gains an optional `fix: SandboxFix`.** It is data,
never words or a command line:

- `{ kind: "install", packageManager, packages }`: install every missing
  package as one command. `packageManager` is one of the closed list
  `sandboxPackageManagers` (`apt`, `dnf`, `pacman`, `zypper`, `brew`), or
  `null` when the machine has none Halonic knows.
- `{ kind: "apparmor-profile", program, path, profile }`: write `profile` to
  `path` and load it. It covers `program` alone; the machine-wide setting
  (`kernel.apparmor_restrict_unprivileged_userns`) is never the fix.

`missing` keeps its type and meaning. Studio and the CLI word the fix, as they
word the reason.

**`fix` is advice to show the person.** No caller runs it or asks for
administrator rights on its own. When Studio or the CLI later offers to run
it, that is a new flow, and it goes to the board with Noah's wording.

**An adapter fills `fix` from constants.** Only `packageManager` comes from
the machine. The program, the path and the profile text are fixed in the
adapter, so nothing from the environment or `PATH` ends up in what a person
is told to run with `sudo`.

**`Sandbox` stays at version 7.** The field is optional on the refused check,
so every adapter and caller compiles and behaves as before, and an adapter
adds it when it can. This follows the optional `HarnessBridge.socketPath`
(v7 ADR) and `ConnectorFactoryContext.sandbox`, which kept their versions.

## Consequences

- `sandbox-srt` sets `fix` for `bubblewrap-missing`, `linux-tools-missing`,
  `ripgrep-missing` and `user-namespaces-restricted` (HAL-5393). Its AppArmor
  profile is the one CI loads on Ubuntu 24.04, where the 39 fence tests pass
  (HAL-6030); a test reads the text from `ci.yml`, so the two can't drift.
- Other adapters change nothing. A refused check without `fix` still means
  "word the fix from `reason`".
- Studio and the CLI showing the fix is its own task, worded with Noah.
- `ports.sandbox-check-fix` keeps the shape true: a check that works can't
  carry a fix, and a package manager outside the list doesn't compile.
