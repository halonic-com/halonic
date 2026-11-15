# Decision: pin that Codex treats the working folder as untrusted

- Approval: Liam reviews and signs on HAL-10527
- Kind: internal
- Task: HAL-3106 slice 3f (HAL-10527)

## What changes

The active requirement `harness-codex.config` gets one sentence and one example, and nothing is weakened: no test was removed or made weaker. It says that neither Codex's `config.toml` nor its command line marks any folder as trusted (`projects` or `trust_level`), so Codex reads no `.codex/config.toml` from the working folder and that file can't set `model_instructions_file` or `developer_instructions`. This was already how the harness behaved. A new test in `config.test.ts` now pins it.

The second part is a test fix in `harness-claude-code`: the check on `--setting-sources` now looks at that value alone, so a path that contains `local` can't match it by accident.

## Covers

- harness-codex.config
