# paperclip-client.task-tools

- Status: active
- Since: unreleased
- Source: HAL-19721 (4.1b of the PR watcher under `halonic serve`, HAL-17974), on the task writes of HAL-17975

The Paperclip provider shall give a workflow's tool steps a connector with three tools over one Paperclip connection: `pr-watcher-pass`, which reads the agent-tools plugin's last PR watcher pass with `GET /api/plugins/halonic.agent-tools/api/pr-watcher/pass?companyId={company}` and answers its JSON as it came; `wake` (`task`, `agent`, `comment`) and `finish` (`task`, `comment`), the two task writes of `paperclip-client.task-writes`. It shall list `pr-watcher-pass` as `read` and the other two as `write`, and send only rows of its fixed request list. It shall take the connection, its key guard included, again at every call, and when the connection has no stored key it shall send nothing and fail the call as a tool error that says `signed-out`. A task of another company, a refusal or a 401 shall fail the call as a tool error that says why. While the workspace isn't trusted, it shall list only `pr-watcher-pass`, and a call to a write shall fail and send nothing. A write shall be sent once and never queued: when it ends offline, or with an answer it can't read, the call shall fail as an error that isn't a tool error, so the run waits for a person to retry or skip it, and a retry under the same idempotency key shall read the task first and answer the change as written without sending it again when the task already shows it.

## Examples

- Given a stored key for company Acme,
  when a tool step calls `pr-watcher-pass`,
  then the provider sends exactly `GET /api/plugins/halonic.agent-tools/api/pr-watcher/pass?companyId=<acme>` and answers its body.
- Given no stored key,
  when a tool step calls `wake`,
  then nothing is sent and the call fails as a tool error saying `signed-out`.
- Given a `wake` whose update is offline,
  when the person retries it and the task already shows the agent with status `todo`,
  then the provider sends one task read and no second update.
- Given an untrusted workspace,
  when its tools are listed,
  then only `pr-watcher-pass` is.

## What it doesn't cover

Which tool steps run without asking is the engine's: a write asks a person first unless the workspace's `tools.read` names it. The plugin's route is HAL-19720.
