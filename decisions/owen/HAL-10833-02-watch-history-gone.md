# Decision: the gateway closes the connection when a watch loses events mid-stream

- Approval: HAL-10833 (Liam, CTO; review point on the watch port)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mScCV9GamdXkPT0mlDc+YdaW0iIROo0sclOid3iXTC6P48iMK12q3xciV9h6NW3MIL6Q+5ASP3pQ5epkQTzPDw==
- Task: HAL-10833

The protocol has no message for "history is gone" in the middle of a watch, only as the answer to a
`watch` request. When the host's session source drops events a watch had not been given, the gateway
now closes the connection. The phone reconnects, resumes from its last `seq`, and is answered
`history-gone` the normal way. `remote-gateway.connection` gains that one clause; nothing is removed
or weakened, and protocol version 1 is unchanged. The cost: the phone's other watches pause until it
reconnects.

## Covers

- remote-gateway.connection
