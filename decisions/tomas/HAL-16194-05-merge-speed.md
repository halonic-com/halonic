# Decision: the PR tools test also expects merge_speed

- Approval: Liam reviews the board check's merge-speed part and signs this note as the CTO
- Kind: internal

Part (e) of the board check (phase 1b, HAL-16194) adds the read tool
`merge_speed`, declared in the Agent tools plugin's manifest after the
other board tools. The `paperclip.pr-tools` test compares the whole list of
declared tools, so it now lists `merge_speed` too. Nothing else it checks
changes.

## Covers

- tooling/paperclip/src/plugin/tools.test.ts
