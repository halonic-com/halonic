# Decision: Claude Code sends no traffic of its own behind the bridge

- Approval: HAL-14992
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:7BxujvAAV4zWeCFrMbD1hzfwJrx03vcvEmfzf3wxF/sDRWY0ZF5k/tgDYnLMzAsfUyCbg3SAF671f4qD5G9UAA==

The HAL-12475 smoke run showed the sandbox refusing Claude Code's own calls
to `api.anthropic.com:443`, 17 to 18 times per run. Its model calls went
through the bridge as they should; the refused ones are its telemetry, error
reports and update checks, which go straight to Anthropic. They can never
work inside the fence, and they bury the blocked connections that matter in
the run's log.

The harness now also sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, Claude
Code's switch that turns all three off. This narrows what a run does: no
call is added, and model calls still go through `ANTHROPIC_BASE_URL`.
`harness-claude-code.environment` gets one clause and its example counts six
variables; its test expects the new variable. Nothing is removed from the
requirement or the test.

## Covers

- harness-claude-code.environment
- packages/adapters/harness-claude-code/src/environment.test.ts
