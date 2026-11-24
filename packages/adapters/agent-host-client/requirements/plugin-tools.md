# agent-host-client.plugin-tools

- Status: active
- Since: unreleased
- Source: HAL-17815; C3 option (a) on HAL-12374, approved by the board on 24 Nov; the host's side is `agent-host.plugin-tools-in-build`

When Studio asks whether this build runs plugin tools, the agent host client shall ask the agent host with no body and answer the host's yes or no. It shall accept only `{ inThisBuild }` with a boolean and no other field, and fail with `answer_invalid` for anything else; a refusal shall keep the host's kind.

## Examples

- Given the shipped single executable,
  when Studio asks,
  then the answer is no, and the request held no body.
- Given an answer with an extra field, or a value that isn't a boolean,
  when Studio reads it,
  then it fails with `answer_invalid`.
- Given a request the host refuses with 401,
  when Studio asks,
  then it fails with `unauthorized`.
