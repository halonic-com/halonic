# Decision: the run failure facts move into `@halonicjs/app/run-failure`

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12464 (Liam: yes, provided the facts carry data rather than wording and the CLI's output stays the same)
- Kind: internal
- Task: HAL-12411

The CLI worked out a failed run's facts (the provider and its name, the secret, the alias, the
agent) in `apps/cli/src/run-failure-of.ts`. Studio's run page needs the same facts for its
banners (UX check R1 to R7 on HAL-12390), and rule E4 says the banner and the CLI's line 1 must
not drift apart. So the facts move into `@halonicjs/app`, under a new entry `./run-failure`:

- `tooling/check/policy.json` lists `./run-failure` among `@halonicjs/app`'s extra exports.
- The facts are data, never words: `withinMs` instead of "5 minutes" or "60 seconds", an ISO
  `resetsOn` instead of "1 Dec", the harness program's id instead of "Claude Code", and
  `overMs` for a busy provider's tries. The CLI words them in `messages/run-failures.ts`.
- Core can't read the model servers' default addresses (an adapter has them), so
  `workspaceModelsOf` takes the CLI's `providerAddress` and keeps each provider's address.

No requirement is edited and no test is removed or weakened. The CLI's tests keep every
expected line word for word; only the facts they expect between the steps are now data. The new
requirement `app.run-failure` and its tests cover the facts in `@halonicjs/app`.

## Covers

- tooling/check/policy.json
