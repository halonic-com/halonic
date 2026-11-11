# studio.src-tauri.served-page

- Status: draft
- Since: 0.1.0
- Source: HAL-196 section 3, HAL-1375, HAL-192, HAL-2612, HAL-2701, HAL-4878

The shell shall refuse every app and plugin command to a request from any address other than its own connect page, and shall let the connect page call only `connect` and, on desktop, `git`, `secret_get`, `secret_set`, `secret_delete`, `pick_folder`, `trust_get`, `trust_list`, `trust_grant`, `trust_revoke`, `run_append`, `run_events`, `run_snapshot`, `run_logs`, `blob_put`, `blob_get`, `record_append`, `record_read`, `record_replace`, `agent_host_request`, `agent_host_stream` and `agent_host_stream_end`. The Studio the computer serves shall get no native access.

## Examples

- Given a request from `http://192.168.1.20:4280/`,
  when it invokes `connect`, `plugin:opener|open_url` or any other command the shell knows,
  then it is refused as "not allowed".
- Given a request from the connect page,
  when it invokes `connect` with `not an address`,
  then the answer is `{"kind":"notAnAddress"}`.
- Given a request from the connect page on desktop, with no folder opened,
  when it invokes `git` with `status` in `.`,
  then the call reaches the command and is refused as `folder_not_opened`.
- Given a request from the connect page on desktop,
  when it invokes `secret_get` with the name `not a name`,
  then the call reaches the command and is refused as `invalid_name`.
- Given a request from the connect page on desktop,
  when it invokes `trust_grant` for a folder that doesn't exist,
  then the call reaches the command and is refused as `folder_unreadable`.
- Given a request from the connect page on desktop, with no folder opened,
  when it invokes `run_logs` for the workspace `.`,
  then the call reaches the command and is refused as `folder_not_open`.
