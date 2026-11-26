# agent-host.request-log-routes

- Status: active
- Since: unreleased
- Source: HAL-19291 (I7 PR 3b, HAL-18391 plan section 2.3, Julian's security notes on HAL-19291); `app.integration-request-log`, `assistant.build.read-request-log`

When Studio asks for a local integration's request log, the agent host shall answer the lines of that integration's log in the person's profile, oldest first, read under the key of the workspace the request names. It shall take the workspace's location and the integration's id, and nothing else; it shall refuse an id that isn't an integration id with 400, and a location that isn't the real path of a workspace the launcher named with 404 `unknown_workspace`, reading nothing. It shall answer a log it can't read with 422 `request_log_unreadable` and a fixed sentence, never the cause. It shall never write a log.

## Examples

- Given the CLI's engine logged a refused request of `notes` in a named workspace,
  when Studio asks for the log of `notes` there,
  then the answer holds that line.
- Given a workspace the launcher didn't name, with a log of `notes`,
  when Studio asks for it,
  then the answer is 404 `unknown_workspace`.
- Given a log file replaced by a link,
  when Studio asks for it,
  then the answer is 422 with "The request log can't be read." and nothing of the file or its path.
