# paperclip-client.who-am-i-final

- Status: active
- Since: unreleased
- Source: the maintainer's review of #6167 (HAL-18736, [minor]), carried into HAL-18772

When `GET /api/cli-auth/me` gives the Paperclip provider a final answer with no user ID (an answer without one, such as an agent key's, or a refusal other than 401), the provider shall not read it again for that connection before mapping messages. It shall read it again only after the read was offline, answered 401, or failed with a 5xx.

## Examples

- Given a connection made with no user whose key `GET /api/cli-auth/me` answers with no user ID,
  when the chat's messages are read twice and a message is sent,
  then `GET /api/cli-auth/me` is sent once.
- Given the same connection while that read answers 403,
  when the chat's messages are read twice,
  then it is sent once.
- Given that read answers 401, then 503,
  when the chat's messages are read three times,
  then it is sent three times.
