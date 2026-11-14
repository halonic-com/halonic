# cli.commands.serve.harness

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4 (v1.17: harness runs on the serve host); build plan on HAL-195 (PR 11); the server's rule `server.harness-on-host`

The `halonic serve` command shall run an agent whose file names a harness (Claude Code or Codex) on this computer, through the engine it opened, the same engine and the same harness host that `halonic run` builds: the harness program starts in a working folder of Halonic's own in the profile, in the sandbox the agent's placement asks for, and the run is recorded in the run store like any other. A served start that names no version shall read the live version, as a routine's run does, so the run records its version and the agent has a copy of it to work in; the server's start routes never pass a version, so a caller can't choose one. A caller of the served API shall not move it: a start that names `harness` or `placement` answers 400 and starts nothing, and a harness agent in a workspace that isn't trusted starts nothing (403). Each served run shall still be checked for the sandbox before it starts, as for `routines watch`.

Rationale: on a served host the caller may be a phone or a page on the internet. The harness program runs commands with the person's rights, so only the person at the computer decides where and how it runs.

## Examples

- Given a trusted workspace whose agent Coder is set to run in Claude Code, when a signed-in caller starts a workflow with a Coder step with `POST /api/runs`, then the harness program starts on this computer in a working folder under the profile, from the live version, and the run completes in the run store.
- Given the same server, when the start also names `harness: "codex"`, then it answers 400 and no program starts.
