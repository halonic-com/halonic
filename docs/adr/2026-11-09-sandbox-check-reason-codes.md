# Sandbox check reason codes: the port says why, Studio says it in words

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Halonic runs Claude Code and Codex only inside its own sandbox. Where the
sandbox can't start, the step doesn't run (the board's "No sandbox, no run",
HAL-1601 proposal 3). The person then needs to know why and how to fix it:
next to Run, as an Inbox item for a scheduled run, and in the CLI check.

`SandboxCheck` had only `ok` and `missing`, a list of sentences the
adapter writes. Studio can't tell from a sentence which fix to show, and the
sentences are in the adapter's words, in English, outside the message
catalogue. We looked at parsing the sentences (fragile), and at a message key
per adapter (each adapter would invent its own list).

## Decision

**`SandboxCheck.reason` is one code from a closed list in the port:**
`windows`, `container`, `user-namespaces-restricted`, `bubblewrap-missing`
and `other`. It is `null` when `ok`. `SandboxCheck` is a union on `ok`, so
a check that can start with a reason, or can't without one, doesn't
compile. When more than one applies, the adapter
gives the first in that order, because its fix comes first. An adapter
returns only listed codes; a new code is a change to the port, through a
task that names it.

**The reason lives on the port** because every adapter (this computer, a VM
later, Halonic Cloud) refuses for reasons Studio must tell apart, and the
port is where the adapters agree. The contract suite checks it.

**The wording lives in Studio's message catalogue, not in the adapter.** The
words and the fix for each code are a design decision the board approves
separately, they get translated, and they must change without touching an
adapter. `missing` stays, for logs and support.

**Halonic never falls back on its own.** A check that isn't `ok` means the
step doesn't run. No adapter, setting or code path starts a program without
the fence, and the refusal offers no "run anyway". Plain Windows has its code
either way; what Studio says for it follows the board's D44 decision.

**Version 3.** The field is required, because an adapter that leaves it out
would leave Studio without a fix to show. Under the port freeze
([port list and versions](2026-11-07-port-list-and-versions.md)) a field the
adapter must fill is breaking for adapters, so `sandboxVersion` goes from 2
(the [fence proof](2026-11-09-sandbox-fence-proof.md)) to 3. For callers it
is additive: code that reads `ok` and `missing` works as before. No adapter
had been written against an earlier version.

## Consequences

- Studio and the CLI map each code to a message and a fix in one place, and
  the board's wording can change without adapter work.
- The first adapter (HAL-193) fills `reason` and runs `sandboxCheckContract`
  from `@halonicjs/testing-contracts`, which fails on a code that isn't
  listed, on a refusal without a code or without what is missing, and on an
  adapter that opens a session when it can't start.
- `ports.sandbox-check-reason` and `contracts.sandbox-check` keep the
  decision true; the port's type test fails to compile on an unlisted code.

## Addendum (HAL-5034): `linux-tools-missing`

srt starts `socat` and ripgrep (`rg`) next to bubblewrap on Linux, and its own
dependency check fails without either. The check only probed `bwrap`, so
`halonic doctor` could say ready on a machine where the first run then failed.
The list gains `linux-tools-missing`, after `bubblewrap-missing` (one `apt`
command fixes both, so the order costs nothing). One code covers both tools;
`missing` stays one sentence for logs.

## Addendum (HAL-6639): `ripgrep-missing`

srt starts ripgrep (`rg`) next to Seatbelt on macOS too, but the check asked
for it only on Linux, so `halonic doctor` said ready on a Mac without ripgrep
and the first run failed with `spawn rg ENOENT`. The list gains
`ripgrep-missing`, after `linux-tools-missing`: `linux-tools-missing` names
`socat` and an `apt` fix, which are wrong on a Mac, where the fix is
`brew install ripgrep`. It is checked after Seatbelt, which macOS always has.
