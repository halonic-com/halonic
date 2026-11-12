# Decision: a harness names its own sign-in, and the contract checks it points at the agent's folder

- Approval: HAL-5395
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/hXILaM9vzClDvvTjbR7SG9Xh7dQY/d2YbvWRnByFGyMVlKs1YJD4cf0S38qivED2euMM133mYnFkugVR4vIBQ==

The board chose a "Sign in for this agent" button in Studio (HAL-5355,
option 1): it runs the program's own sign-in in a terminal the person can
see, pointed at that agent's settings folder. Studio and `halonic doctor`
need that command without knowing each program, so the harness names it.

What changes:

- The `Harness` port gets an optional `signIn`: the program, its sign-in
  arguments and the variable that points it at the agent's settings
  folder (new requirement `ports.harness-sign-in`). It is an optional field
  callers may ignore, so under the port freeze it isn't breaking and
  `harnessVersion` stays 2.
- Claude Code names `claude auth login` with `CLAUDE_CONFIG_DIR`, and Codex
  `codex login` with `CODEX_HOME` (new requirements
  `harness-claude-code.sign-in-command` and `harness-codex.sign-in-command`).
- `contracts.harness` gains one sentence and one example: where an adapter
  names a `signIn`, its variable is one its `environment` sets to the
  profile's settings folder. Nothing in it is removed or weakened. A
  harness without a `signIn`, such as the built-in loop, passes as before.

Risk: none for runs. Nothing calls `signIn` yet; the agent host's route
that opens the terminal is the next pull request on HAL-5395.

## Covers

- contracts.harness
- ports.harness-sign-in
- harness-claude-code.sign-in-command
- harness-codex.sign-in-command
