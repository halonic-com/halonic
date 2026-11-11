# Decision: `halonic run` refuses an agent in a harness

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:U8DllRIo4+sPXKykI8GLJR0mwZCSF60zRUsJyAcWYE7CMvYdu/Q76zgGd4CGsmnXHgnQrKjohYKIxU2qxXyQCQ==

The engine `halonic run` opens has no harness adapter, so a workflow with an agent in Claude Code or Codex failed at that agent's step after the run had started and been written to the run log. `run` now refuses it up front (`unavailable`, exit 9, nothing ran) once the sandbox check has passed. The sandbox is still checked first, so a computer that can't start it says so. The requirement gains one sentence and one example, and the example "An agent set to On this computer prints a ! line and the run starts" is replaced by the refusal, since that run could only fail. The matching test is replaced by two that pin the refusal.

## Covers

- cli.run-sandbox-gate
- apps/cli/src/commands/run/sandbox.test.ts
