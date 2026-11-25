# Decision: register the ./web entry points of the harness kit, Claude Code and Codex adapters

- Approval: Liam reviews this on HAL-18013; the design was confirmed on HAL-18023
- Kind: internal

`@halonicjs/adapter-harness-kit`, `@halonicjs/adapter-harness-claude-code` and `@halonicjs/adapter-harness-codex`
each get a `./web` entry that reaches no `node:` or third-party code, so the Cloudflare Worker can run harness
steps in its per-run container. The package roots keep their Node behaviour unchanged. This note registers the
three subpaths in `extraExports` of `tooling/check/policy.json`, which is the only change to that file.

## Covers

- tooling/check/policy.json
