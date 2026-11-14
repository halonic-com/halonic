# Decision: the AI agent fields get a local-model example, and the Base URL carries no name or password

- Approval: Liam approved the edit in the review of #2354 (HAL-8763); the example wording is a team decision under HAL-2282
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fzr+nXu1BXkxfSyVJGcxHbW4E+5B0j+CyXXugNNMhKbKOWDE/6NyzwsGFNUK0IOH9w7vR2q/IXjahh5txuw1Ag==
- Task: HAL-8123

## What changes

`settings.ai-agent-fields` now gives an example of an OpenAI-compatible model that runs on the
user's own computer (LM Studio), and says that the Base URL must not carry a name or password.
No example is removed.

## Why

People who run a local model had no example to copy, and a Base URL with a name or password in it
would be saved and shown in plain text.

## Covers

- settings.ai-agent-fields
