# agent-host-client.harness

- Status: active
- Since: 0.1.0
- Source: HAL-4878; `apps/agent-host/README.md`, "The harnesses over loopback"

The stand-ins shall offer one `Harness` for each harness of the host's `GET /v1/harnesses`, with its id and name, and answer `detect` with the host's `POST /v1/harnesses/detect`, naming the agent's settings folder to the host when `detect` is given one. A stand-in's `environment` shall be the harness's own function, given by Studio, and missing for a harness without one. Starting a run shall need a session open in the host and a bridge opened there, and shall name both to the host by their ids, never by the bridge's token. The run shall read the host's stream from the start, so `send` and `cancel` work before its events are read; it shall give each event in order, end after `finished`, and fail with the host's message after `failed`, after a refusal, or when the stream stops without either. `send` shall fail with the host's kind when the run refuses the input. When the stream ends before the host's `started` line, `send` shall fail with `run_not_started`. `cancel` shall resolve only once the run's stream has ended, and shall count a run the host no longer has, or one that never started, as stopped. Before the host has started the run, `cancel` shall hang up at once rather than wait for its id.

## Examples

- Given a host that offers Claude Code and Codex,
  when Studio lists the harnesses,
  then the engine gets two stand-ins, and each one's `environment` is that adapter's own.
- Given a run the host started,
  when the engine cancels it before reading any event,
  then the host gets `runs/cancel` with the run's id, and `cancel` resolves when the stream ends.
- Given a host whose run fails with a message,
  when the engine reads the events,
  then reading throws that message.
