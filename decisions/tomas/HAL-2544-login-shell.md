# Decision: the login-shell tests skip on Windows

- Approval: Paperclip task HAL-4117 (review of the runner lookup, for HAL-2544)
- Kind: internal

`login-shell-path.starts.test.ts` starts a stand-in login shell, a POSIX shell script, to show
that the launcher reads only the `PATH` it prints, gives none for a failing or relative shell, and
never runs a shell under a skill's `scripts/` folder. Windows can't run that script, and the
launcher only reads a login shell's `PATH` on macOS. So its POSIX-only part is
`describe.skipIf(process.platform === "win32")`, as `node-program-starter.starts.test.ts` already
does in this package. The Windows half of `mcp.runner-lookup`, `PATH` and `PATHEXT` in any letter
case, runs everywhere. The Windows runner rules run everywhere too, in `find-runner.test.ts`,
against a made-up file list.

The pull request also adds `packages/adapters/mcp/src/pinned/login-shell-path.ts` to
`tooling/check/process-starters.json`, which needs the maintainer's review. The note covers it as
`tooling/check/`, the guarded path that file falls under.

## Covers

- packages/adapters/mcp/src/pinned/login-shell-path.starts.test.ts
- tooling/check/
