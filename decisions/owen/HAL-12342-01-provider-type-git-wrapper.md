# Decision: the CLI names a provider type Halonic can't call and a git that drops its settings

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12342 (Liam, CTO; decided in the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DZ5wL7NnabJIiJwh81cvmbBYnX0+rMRo2NRhBjkSS0yoaBHhzaSSuMbB5NZdq6DCOr8dWuWx3Q6ieiKkabDMAQ==
- Task: HAL-12342

Two failures had a cause the CLI already knew but didn't say.

**A provider type Halonic can't call** is a typo in the workspace, not a bug, but the CLI said
"Halonic can't tell the cause yet" and asked for a bug report. The error now carries the cause
`models.unknown-provider-type` with the provider and its type, and the CLI prints:

    provider weird has type carrier-pigeon, which Halonic can't call.
    Set type in providers/weird.yaml to one of anthropic, openai, openai-compatible, ollama, lmstudio or mock, then run again.

There is no report link. The list of types comes from one exported `providerTypes` list in
`workspace-models`, which the provider loader also uses, so it can't go stale.

**A git that drops Halonic's git settings** (a wrapper script, a version manager's shim or git
older than 2.31) was reported as "git can't start on this computer… Install git"; only `--debug`
showed the cause. `halonic run` (and `runs send`) now say:

    the git at <path> doesn't pass Halonic's git settings on to git, so the live version can't be read safely. Nothing ran.
    It may be a wrapper script, a version manager's shim or git older than 2.31. Put git 2.31 or later itself first on your PATH, then try again.

The exit code stays 9. This means the same as Studio's `HardeningIgnored`. The fix line says
"first on your PATH" because the CLI has no option to pass a git path.

## Covers

- cli.run-failure
- cli.run-live-version
