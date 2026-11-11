# app.runs-read-latest-version

- Status: active
- Since: 0.1.0
- Source: save model 2.2–2.3 (HAL-1102, HAL-3236 task 2, HAL-3246); plan 9.1, whole-item reading (HAL-3227); stub `engine.runs-read-latest-version` in req-core-engine; the known limit for programs from Julian on HAL-4966

When a run is started by Run, a routine, a trigger or a call from another agent or workflow, the app shall read the whole workspace at the live version's commit, never the saved files; when it is started by Try it or Test, it shall read the saved files. With history off, every run shall read the saved files. When the workspace has history but no version yet, a run that reads the live version shall have nothing to start.

When a run that reads the live version starts a program from the workspace folder, such as an unpinned stdio connector's script or a harness agent's working folder, that program shall read the saved files on disk, including changes that aren't live yet. This is a known limit for v0.1 (Julian's security review, HAL-4966): trust and the sandbox are checked on the live version, so a saved change can't add a program or widen what it may do, but it can change what an already trusted program reads. Those saved changes aren't only the person's own: a builder chat or an agent can write a script too, and that script can run in a live run, for example a scheduled routine, before anyone has made it live. The follow-up that runs these programs from a copy at the live commit is HAL-4975.

## Examples

- Given agent "briefing" live with `model: fast` and saved with `model: smart`,
  when a run is started by Run, a routine, a trigger or a call, then it reads `model: fast`;
  when it is started by Try it or Test, then it reads `model: smart`.
- Given agent "triage" with saved changes that aren't live, when a routine's run reaches it, then it reads the live "triage".
- Given a workspace with history off, then every run reads the saved files.
- Given a connector whose script is live as "the live script" and saved as "the saved script",
  when a run started by Run calls the connector, then the program it starts answers "the saved script".
- Given a repository without a commit, when Run is chosen, then there is nothing live to start; when Try it is chosen, then it reads the saved files.
