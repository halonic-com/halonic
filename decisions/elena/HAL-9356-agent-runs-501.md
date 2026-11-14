# Decision: a start the executor can't do answers 501 agent_runs_not_supported, not 500

- Approval: Liam approved it in the final review of #2683 (HAL-9446); Ravi's review on HAL-9360 is the second opinion
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:k/8N/1wjHTZxDloF0OkhkQfGvGZrUmowQIT9vmbKNoyOWLyyzt0UrdOf60ICVDKihZT23263J0jWloVIrcqvBg==
- Task: HAL-9356

## What changes

`server.trust-gate` now says that a start the executor rejects with `AgentRunsNotSupported`
answers 501 `agent_runs_not_supported` with a fixed message, and that a start's other failures
still answer 500. An example is added: the 501 body doesn't repeat the executor's message.
No example is removed, and nothing about the trust gate itself changes.

## Why

On `halonic serve`, `POST /api/agent-runs` answered 500 because the local executor can't start
agent runs yet. That told the person the server broke, when it simply can't do that yet. The
remote executor needs the code to rebuild `AgentRunsNotSupported` on its side.

## Covers

- server.trust-gate
