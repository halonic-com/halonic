# Decision: the hello names the server's mode and the oldest Studio it works with

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13348 (Liam's item 4 decision, carried onto HAL-13265)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PoKdbcTTSuH2HRTSX6td6oVyOG9P6sNBZ4HAbMi0fFSUs/x8fOZ5nIcMlaYyMPYSdTvs6TgdqGS8sMtAoqpBBA==

`GET /api/hello` gets two more keys, so it has six instead of four. `mode` is `owner` or
`many`, so Studio attaches only to an owner's server and refuses a product's many-user
server. `minStudioVersion` is the oldest Studio the protocol works with: a fixed floor
(`0.1.0` today), not the server's own version, so Studio can refuse a server that needs a
newer Studio. Neither key names a workspace, host or user, so the route still tells nothing
about the server beyond what it told before. `server.hello` is edited to say this; its first
example gains the two keys, and no test is weakened. The engine role's own hello doesn't
change.

## Covers

- server.hello
