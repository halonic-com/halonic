# Decision: the socket path cause says how to move Halonic's data

- Approval: Liam approves this note in his review of this pull request on HAL-13931 (a team decision with no board card, HAL-2282 rule: it adds a how-to to a sentence the team already decided on HAL-13862 and HAL-13882)
- Kind: user-visible
- Task: HAL-13931

## What changes

A run that fails because the bridge's socket path is too long said "Move Halonic's data to a
shorter path." in the CLI and Studio, but not how, and no user doc named the setting.

The socket is `<profile folder>/bridges/<8 characters>/bridge.sock` in both hosts: the CLI
(`local-harness-host.ts`) and the agent host Studio starts (`bridgeSocketFolder`). The profile
folder is `HALONIC_HOME`, or else the system's data folder (`profileFolder`). So setting
`HALONIC_HOME` to a short folder is the real fix, and no runtime or temp folder is involved.

- CLI (the bridge's own message): "The bridge's socket path would be 161 bytes, and Linux takes
  at most 107. Move Halonic's data folder to a shorter path, such as ~/.halonic, and set
  HALONIC_HOME to that path."
- Studio: "…too long for the bridge's socket (161 bytes, and Linux takes at most 107). Move
  Halonic's data folder to a shorter path, such as ~/.halonic, set HALONIC_HOME to that path and
  reopen Halonic, then run again." A phone starts "On your computer, move Halonic's data
  folder…".
- The CLI README gets an Environment section: what `HALONIC_HOME` holds, the default folders,
  that the CLI and Studio share it, and a two-line example of the move.

## Why

"Move" and "set" both stay: setting `HALONIC_HOME` alone starts an empty profile, so trust
records, runs and keys would seem lost. Studio adds "reopen Halonic", because the agent host reads
the profile folder when it starts, and Studio started from the Dock reads `HALONIC_HOME` from the
shell's startup file (`login-shell`). The CLI reads it on each command, so it needs neither.

## Tests

No test was weakened or removed. The existing cases now expect the new sentences.

## Covers

- harness-bridge.socket-path-limit
- cli.run-failure
- runs.run-view.failure-banners
