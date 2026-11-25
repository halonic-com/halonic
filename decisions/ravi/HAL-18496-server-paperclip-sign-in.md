# Decision: one file fewer for the agent host's "no file writes" test

- Approval: the move was approved with the code in Liam's review of halonic#6163 on HAL-18496; Liam approves this note in review on HAL-18496
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VCcM2u5ATjnsAtoIYVrIGInvu4deTf0PUuNFZPo1f/u5+T7I2GeOmB4Ja0IyOvCBaBQCNfblSkPYXdqRgHG5BA==

The test "keeps the key in memory only" of `agent-host.paperclip-key-hand-over`
reads every source file in `apps/agent-host/src/paperclip/` and makes one
`expect` call per file. This pull request moves `sign-in-phrase.ts` from that
folder into `@halonicjs/adapter-paperclip-client`, so the server engine and the
desktop host share it. The test now reads one file fewer and makes 79 calls
instead of 80. No assertion was removed or weakened: every file left in the
folder is still checked, and the moved file writes nothing either.

## Covers

- agent-host.paperclip-key-hand-over
