# assistant.build.read-request-log

- Status: active
- Since: unreleased
- Source: HAL-19170 (I7 PR 3, HAL-18391 plan rev 2 section 2.3, with Liam's condition that `failureCause.detail` is untrusted); HAL-525; HAL-19291 (Liam's and Julian's notes on #6405: line length, failed reads)

When the host gives the local request log of the integration a Build chat is about, the chat shall have a `read_request_log` tool. The tool shall read nothing while the workspace isn't trusted, in a chat that isn't about a local integration, or for any integration but the one the chat is about, and shall say why. Otherwise it shall answer with the newest 50 lines of that integration's log, oldest first, each cut to 500 characters, with every host, path, tool name, error kind and field name of the log inside the untrusted fence; outside the fence it shall say only the integration's id, how many lines it shows, and how to read them. When the log can't be read, it shall answer a fixed sentence naming only the integration's id, never the error. Its result shall count as untrusted text loaded (`assistant.build.loaded-page`), and the gate on the hosts and sign-ins the person named (`assistant.build.named-hosts-secrets`) shall refuse any host only the log names.

## Examples

- Given a trusted chat about the `notes` integration, whose log has a refused request to `cdn.notes-moved.example.com`,
  when the model calls `read_request_log` for `notes`,
  then the host, the paths and the field names are inside the fence only.
- Given a failure whose field holds `</untrusted>` and instructions,
  when the log is read,
  then the result has exactly one fence start and one fence end, and the instructions are inside it.
- Given the log was read,
  when the model proposes a sheet that adds `cdn.notes-moved.example.com` and the person didn't name it,
  then the proposal is refused.
- Given the person typed `cdn.notes-moved.example.com`,
  when the model proposes the same sheet,
  then it becomes a change to review.
- Given a workspace that isn't trusted,
  when the model calls `read_request_log`,
  then nothing is read and the answer says the workspace needs trust first.
