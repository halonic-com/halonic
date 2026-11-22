# A WSL distro without its runtime says `runtime-missing`

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

On Windows the sandbox runs in Halonic's own WSL distro, and the agent host
there runs from the runtime installed in it (`/opt/halonic/current`). A setup
that stopped after the import leaves the distro without a runtime. The shell
then can't start the host in the distro, but its refusal had no `reason`,
because no code fit (HAL-14642, option 3). `distro-missing` was wrong: its
words say the Linux system isn't installed, and its fix imports the distro
again. Since HAL-14644 the setup has an `installing-runtime` step, and running
the setup again (repair) installs a missing runtime without importing the
distro again (#4377). So the case now has a fix of its own.

## Decision

**`runtime-missing` is a new `SandboxUnavailableReason`:** Halonic's distro is
imported, but the runtime that runs the sandbox in it isn't installed. It sits
right after `distro-missing`, because repair fixes both.

- The WSL setup gives it when its `installing-runtime` step fails
  (`runtime-busy` or `runtime-install-failed`) and the distro has no current
  runtime. With another version still current, the sandbox starts on that
  one, so the setup keeps `other`.
- The shell gives it on the `host_unavailable` refusal when the distro is left
  with no runtime (a follow-up to #4466, which installs the shipped runtime at
  host start).

**Version 10 of `Sandbox`.** The list is closed, so a new code is a breaking
port change, as in versions 6 and 8. Nothing else in the port changes.

## Consequences

- Every catalogue that words each code words `runtime-missing`: "Halonic's own
  Linux system for the sandbox is installed, but its setup didn't finish."
  Studio's fix points to Settings, as for `distro-missing`; the CLI's says to
  use Halonic inside WSL 2 (HAL-7540). The compiler finds a catalogue that
  misses it.
- Settings › Agent sandbox reads it as Needs repair, like `distro-missing`.
- The sandbox choice counts it as a one-time setup, and the runner's reasons
  list it.
- `sandbox-check-reason.test.ts` pins the list and its order, and the
  contract suite runs on a fake that gives it.
