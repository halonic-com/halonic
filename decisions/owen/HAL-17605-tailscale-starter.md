# Decision: a process-starter entry for the Tailscale tunnel provider's runner

- Approval: HAL-17605 (plan approved on HAL-17607)
- Kind: internal

The Tailscale tunnel provider (`@halonicjs/adapter-tunnel-tailscale`, pull request 5675) runs
the `tailscale` CLI. CI checks `process-starts` against the base commit's
`process-starters.json`, so its entry merges first, on its own, as for HAL-5884.

The entry is for `packages/adapters/tunnel-tailscale/src/tailscale-runner.ts`. The runner:

- starts only a program whose file name is `tailscale` (or `tailscale.exe`), found on `PATH`
  (absolute folders only) or given as an absolute path, and never one inside a `scripts`
  folder, so it never starts a skill's script;
- uses `execFile` with an argument list, `shell: false` and `windowsHide: true`;
- passes on only `PATH`, `HOME`, `USERPROFILE`, `SystemRoot` and the locale variables;
- kills a call after 10 seconds or 1 MiB of output.

The provider builds only `status` and `serve` commands: never `funnel`, a sign-in or
`serve reset`, and no argument carries a key. Its `scriptsTest`,
`tailscale-runner.test.ts`, lands with the code in pull request 5675. Until then the rule only
warns about the entry.

No test, golden file or requirement is weakened or removed.

## Covers

- tooling/check/
