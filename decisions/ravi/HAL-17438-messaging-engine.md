# Decision: bind a Paperclip key to its workspace, and refuse plain http to another computer

- Task: HAL-17438
- Approval: Liam asked for both on the review of #5658 (HAL-17495), carried over to HAL-17438 (https://paperclip.halonic.com/HAL/issues/HAL-17438#comment-7a7ae7fc-9cc0-4971-a754-fbe90a834504); Liam approves this change on HAL-17438 with the review of this pull request. A team decision with no board card (HAL-2282 rule).
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AR8xj9eg0mcFgJmwWDfdE0iZBV8wfbhbLtqmFgBo5IV/OWzfAKPRiJsLrkQflwmLJsvyFhcgzuDanTyCpUsnCQ==

## What changes

The agent host now keeps a Paperclip key bound to the workspace it was handed over for, not only
to the connection's name. `POST /v1/paperclip/key` takes the workspace's path too, refuses a folder
the launcher didn't name with 404 `unknown_workspace`, and refuses an address that is plain `http`
to another computer (only `localhost`, `127.0.0.1` and `::1` may be `http`). The Studio stand-in
(`AgentHostPaperclipKey.handOver`) and `connectPaperclip` pass the workspace, and the stand-in gets
`disconnect` for the new `POST /v1/paperclip/disconnect`.

The three requirements that describe the hand-over say so. Nothing they required before is
dropped: every earlier example still holds and keeps its test; each gains the workspace in its
body or call, and new examples and tests are added.

## Why

Liam's review of #5658 found two gaps. Keys were stored by connection name, so a second workspace
with a file of the same name, address and company (a clone, say) would have used the key without
the person connecting it there; that breaks "connecting is only a user action" (Julian's finding 6
on HAL-17436). And the ADR allows plain `http` only to this computer, so the host now refuses it as
a second safeguard next to the client's own check.

The keychain entry stays one per connection name (`paperclip-<connection>`): connecting a second
workspace with the same name is the person's own action and reuses it, and the address and company
guard still applies there. Disconnect deletes that one entry.

The draft `ports.paperclip-key` moves to the agent host as the active `agent-host.paperclip-key`,
as the ADR planned. The paperclip-client tests that named the draft (14 on `main`) now name the new
ID; none was dropped, and `key-guard.test.ts` adds 6 more.

## Covers

- agent-host.paperclip-key-hand-over
- agent-host-client.paperclip-key
- services.paperclip-connect
- ports.paperclip-key
