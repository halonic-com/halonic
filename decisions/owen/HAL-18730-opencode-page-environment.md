# Decision: the Studio gives OpenCode agents their environment

- Approval: Paperclip task HAL-18730 (follow-up from HAL-18718, agreed with Liam); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2YSc2pTT75Jj9w7zQrFCDkRWMS4//T1sZmna0jkK4eqyEX3ayxhdsytoxm+qDkpcTKanqRdoMJtoq+XqQBNAAQ==

The agent host already runs OpenCode agents, but the Studio page had no `environment` function for them, because `opencodeFiles` imported `node:path`. It now joins with `pathBelow` from `@halonicjs/std`, so the adapter can offer a page-safe `./environment` entry point, the same way Claude Code and Codex already do.

- `services.agent-host-harnesses` now names `opencodeHarnessEnvironment` for `opencode`, and gains an example for it. Nothing about Claude Code, Codex or unknown harnesses changes.
- `tooling/check/policy.json` gets one `extraExports` entry: `./environment` for `@halonicjs/adapter-harness-opencode`.
- The Studio's harness picker still hides OpenCode in v1, so no person sees a change.

## Covers

- services.agent-host-harnesses
- tooling/check/policy.json
