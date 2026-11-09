# Decision: three optional agent fields for harness agents

- Approval: stack 2a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved with changes by Liam on [HAL-1967](/HAL/issues/HAL-1967); the package owner (Elena) and Liam review; Julian reviews the validation tests
- Kind: internal
- Task: HAL-189

## What changes

The agent kind gains `harness`, `workingFolder` and `allowedSites`, all optional with no
default filled in, so a parsed older file is exactly as before and the `format.agent-file`
defaults test doesn't change. The agent's JSON Schema spec file (`spec/agent.schema.json`) gains the three properties; no
existing property changes. The old schema in the parity fixtures never has these keys, so parity
is unchanged.

## Why

A harness agent's file has to say which program it runs in, the one folder it may write and the
sites it may reach. These decide what a program on the person's computer can touch, so:

- `harness` is a closed list; a new harness changes the format (noted in the README).
- `workingFolder` is refused when it leaves the workspace or points into `.git`, `.halonic`,
  `hubs`, any kind's folder or a kind file in the workspace root. A test ties the protected
  list to every kind's place. The first part is compared after NFKC and case folding, since
  macOS and Windows file systems ignore case. Names Windows reads as another name are refused
  outright rather than cleaned up: a trailing `.` or space, `:` (drives and NTFS streams),
  `~` and a digit (8.3 short names), control characters and invisible code points. A first
  part starting with `.git` is refused (Liam, HAL-2228; Julian, HAL-2221). Symlinks
  can't be checked here (the format has no file system); the 4b profile builder resolves them.
- `allowedSites` follows Liam's review: a bare `*` and `*.` over one label are refused, every
  entry needs two labels, addresses (a last label starting with a digit, so hex forms such as `127.0x1` too), ports,
  schemes, paths, fullwidth forms, ideographic dots, invisible code points and `localhost`,
  `local`, `localdomain`, `internal` and `arpa` names are refused (Julian, HAL-2221), and
  `asciiAllowedSites` gives the stored form (lowercase, Punycode via std's `asciiHost`, each once).
  At most 50 entries (Julian, HAL-1708).

No test was weakened or removed.

## Covers

- format.agent-sandbox-fields
- packages/core/format/spec/agent.schema.json
