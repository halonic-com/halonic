# Decision: wording fixes from the 10–11 Nov words check

- Approval: Liam decided this on [HAL-5005](/HAL/issues/HAL-5005) (Sofia's words check on HAL-4989), small wording, a team decision with no board card; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:s1DRjE7x8nJwngd++uhoBB4H5lTMZ8e6Wp7Pp0rzeUn+2ixxxYr/L9ELV/EecH2tbyyYcuq35abznwAjIQUUCg==
- Task: HAL-5005

## What changes

`cli.messages`: the fix line of a run stopped by its budget says "Raise the budget in
workspace.yaml." instead of "models.yaml". `budget` is a key of `workspace.yaml`; `models.yaml`
has none. The example keeps its shape, only the file name changes.

`integration-kit.loader`: the fix for a local integration whose sheet declares `tokens` says
"Remove tokens from its sheet and use an API key, or ask for sign-in support.", so the author knows
which line to remove. The refusal itself (`tokens-not-allowed`, built-in sheets still load) is
unchanged.

## Why

Both are wording, from the words check: the old budget line pointed at a file where the setting
isn't, and the tokens line gave no way forward. The same pull request rewords three messages
without a requirement (agent host limits, MCP 401, the tokens sentence) to the glossary's words.

## Covers

- cli.messages
- integration-kit.loader
