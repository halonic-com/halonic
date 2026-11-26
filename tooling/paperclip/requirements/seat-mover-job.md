# paperclip.seat-mover-job

- Status: active
- Since: unreleased
- Source: HAL-19354

When the Agent tools plugin's `seat-move` job runs (every minute) with its mode on `shadow` or `act`, it shall read each connected AI connection's grant and method, the seat readings plugin's `seats` readings (a reading older than 45 minutes, with an error or without both windows counts as none; reset times are read from the plugin's UTC text), the runs parked for a seat that never started, and the `provider_quota` failures of the last hour, and plan the batch by the seat mover checklist (`paperclip.seat-mover-checklist`).

In `shadow` mode it shall move nobody and comment the plan on the log task only when it changed. In `act` mode it shall, for each move, read the agent, send its whole `runtimeConfig` back with only `aiConnection` changed, read it again and put `heartbeat` back if it changed; remember when it moved the agent, for the two hours in which only a full seat or parked runs move it again; leave an agent someone else moved since the read; not send a move whose target fails the checklist against where agents actually sit; release each run still parked on a seat its agent left whose retry is more than 15 minutes away (cancel it, resolve the recovery hold it leaves as restored with nothing performed, and wake its task once); comment the batch on the log task; and tell the board task once per agent and seat when an agent must move and no seat may take it. With the mode `off`, or without the Paperclip API address and key in the settings, it reads nothing and moves nobody.

## Examples

- Given the mode `shadow` and an agent on a seat at 85%,
  when the job runs twice,
  then nobody moves and the log task gets one comment with the planned move.
- Given the mode `act` and the same seat,
  when the job runs,
  then the agent's runtimeConfig is sent with only the seat changed and its heartbeat kept.
- Given two runs of an agent's task parked on a seat it left, retrying in two hours,
  when the job runs in `act` mode,
  then both are cancelled, their holds resolved, and the task woken once.
- Given an agent that must move and no legal seat,
  when the job runs twice,
  then the board task is told once and nobody moves.
