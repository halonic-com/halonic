# Decision: the harness environments are their own browser-safe entry points

- Approval: HAL-4878
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6sg1BaNfvdBd/6k62/03sfQBWKxRKYMCSHDhgT+utNriEAfvCU5Njk9amzb0ghhxyn70NPuDdJge3Vc6QhVKDA==

Studio runs harnesses in the agent host but computes each harness's
environment on its own page (HAL-4878 plan, "`environment` stays local").
The page can't load Node modules, and `harness-claude-code` and
`harness-codex` are Node adapters. So `claudeCodeEnvironment` and
`codexEnvironment` are now also the entry points
`@halonicjs/adapter-harness-claude-code/environment` and
`@halonicjs/adapter-harness-codex/environment`, which import only
`@halonicjs/ports`.

`harness-claude-code.environment` and `harness-codex.environment` each get
one sentence and one example saying so, with a test that reads the entry's
imports. Nothing else in either requirement changes, and the existing tests
stay as they were. `tooling/check/policy.json` lists the two new entries
under `extraExports`, which the packages rule asks for.

## Covers

- harness-claude-code.environment
- harness-codex.environment
- tooling/check/
