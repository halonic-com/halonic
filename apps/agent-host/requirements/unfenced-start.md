# agent-host.unfenced-start

- Status: active
- Since: unreleased
- Source: HAL-13195 (Studio's agent host gets an unfenced session; Liam planned it after HAL-13090)

The agent host shall start a program in a session without the sandbox only with an environment it worked out itself, because such a program runs with all the person's rights. The host shall keep, for each session it opened without the sandbox, the profile it built for that session, the agent it built it for and the instructions folder it built it with, until the session closes. `POST /v1/harnesses/runs/start` shall answer `403 environment_not_host`, before the bridge binds and before the harness starts, for a run in a session whose fence is `off` that the host didn't open that way, and for a run in such a session whose environment isn't exactly the built profile's variables plus the variables the run's harness adds for the run's bridge (its address, token and the providers it serves with a key Halonic keeps) and the run's task. So no variable the page picks, such as `PATH`, `NODE_OPTIONS` or `LD_PRELOAD`, reaches the program, nor one that names another bridge or model. Before the environment, it shall answer `403 task_not_host` for a run in such a session whose task names another hub or agent than the one the host opened the session for, or an instructions folder other than the one it built the profile with. A run may leave the folder out. The instructions folder becomes part of the program's command line (Claude Code's `--plugin-dir`, Codex's skills folder), and a plugin's hooks run without asking anyone, so the page can't pick it either. A fenced session's runs are not checked here: their fence holds whatever their variables say.

## Examples

- Given a session the host opened without the sandbox with its built profile,
  when Studio starts a run in it whose environment is that profile's plus the harness's own variables,
  then the run starts.
- Given the same session,
  when the run's environment adds `NODE_OPTIONS`, or changes or leaves out `PATH`,
  then the host answers `403 environment_not_host` and the harness never starts.
- Given the same session,
  when a harness variable names another bridge or another model than the run's,
  then the host refuses the run.
- Given the same session,
  when the run's task names an instructions folder the host didn't build the session with, such as a folder holding `hooks/hooks.json`,
  then the host answers `403 task_not_host` and the harness never starts.
- Given the same session,
  when the run's task names another agent than the one the host opened the session for,
  then the host answers `403 task_not_host`.
- Given a session whose fence is `off` that the host didn't open for an agent on this computer, or one that has closed,
  when Studio starts a run in it,
  then the host refuses the run.
- Given a fenced session,
  when Studio starts a run in it,
  then this check lets it through to the fence.
