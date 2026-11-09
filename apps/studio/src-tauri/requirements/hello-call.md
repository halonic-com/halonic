# studio.src-tauri.hello-call

- Status: draft
- Since: 0.1.0
- Source: HAL-1150, HAL-1375 (flow-install-update 5.3)

When the shell makes the hello call, it shall connect only to the IP addresses the connect check approved, without a proxy and without looking the name up again, and shall not follow a redirect. If nothing answers within the time left of the 5 second limit, then the shell shall report "not answering".

## Examples

- Given a name the check approved as `127.0.0.1`,
  when the hello call is made,
  then it reaches `127.0.0.1` without a second lookup.
- Given an answer `302` to another address,
  when the hello call is made,
  then the redirect is not followed and the answer counts as "not Halonic".
- Given an address where nothing listens,
  when the hello call is made,
  then the result is "not answering".
