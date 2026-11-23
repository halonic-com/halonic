# Decision: the PR tools test also expects merge_speed

- Approval: Liam reviews the board check's merge-speed part and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8ZyojS0VqDlhqpn4N3F4+Ur2h0fD/g6xZwZY1QkR583IBZwf8a6caIjrbJ1nX2nWxsW9LMNe4UnkXSVHVumMCg==

Part (e) of the board check (phase 1b, HAL-16194) adds the read tool
`merge_speed`, declared in the Agent tools plugin's manifest after the
other board tools. The `paperclip.pr-tools` test compares the whole list of
declared tools, so it now lists `merge_speed` too. Nothing else it checks
changes.

It also carries the non-blocking fix from the #5316 review: part (d) saves
the approvals it has seen only when its comment went out, or when there was
none. So an approval that turns pending while writes are off is listed on
the first pass after the board turns writes on. The requirement
`paperclip.board-check-approvals` says this now and has an example for it;
what it already promised stays as it was.

## Covers

- tooling/paperclip/src/plugin/tools.test.ts
- paperclip.board-check-approvals
