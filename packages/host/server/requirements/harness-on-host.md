# server.harness-on-host

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4 (v1.17: harness runs on the serve host); build plan on HAL-195 (PR 11)

The server shall start an agent whose file names a harness (Claude Code or Codex) on the host it runs on, through its own run executor, and never on the caller's computer. Where and how that agent runs shall be the host's decision alone, taken from the agent's file and from the choices a person made at the computer: a start request shall not choose the harness, the placement ("sandbox" or "this computer"), the sandbox, the profile, the working folder or the allowed sites. `POST /api/runs` and `POST /api/agent-runs` shall refuse with 400 (`bad_request`) a body that names `harness`, `placement`, `sandbox`, `profile`, `workingFolder` or `allowedSites`, before the trust gate is asked, and shall start nothing. A start that names none of them shall pass the executor only the fields it validated (`hubId`, `workflowId` and `input`, or `hubId`, `agentId` and `prompt`, and an optional `runId`), so an unknown field in the body never reaches it. The trust gate, the sign-in and the body limit shall apply to a harness agent's start as to any other.

Rationale: a harness agent is a program that runs commands with the person's rights. On a served host the caller may be a phone or a page on the internet, so it must not be able to move an agent out of its sandbox, onto "this computer", or into another folder. Refusing, not ignoring, a field tells a client it set nothing.

## Examples

- Given a signed-in caller and a trusted workspace, when `POST /api/agent-runs` names `harness: "codex"`, then it answers 400 and `startAgent` is never called.
- Given the same caller, when `POST /api/runs` names `placement: "this-computer"`, then it answers 400 and `start` is never called.
- Given a start with an extra field `note`, when it is valid otherwise, then the run starts and the executor gets no `note`.
- Given a start that names `sandbox`, when the workspace isn't trusted, then it answers 400, not 403, and the gate isn't asked.
