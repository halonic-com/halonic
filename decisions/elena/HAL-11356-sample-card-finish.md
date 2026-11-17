# Decision: a workflow opens on its Tests, and the finished sample card offers Run its tests

- Approval: the finished Try the sample card is in the board-approved first-run flow (flow-first-run rev 15, HAL-663, section 3.3); Liam approved the T15 plan that builds it on HAL-10917
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:eU+Yp4BxZEAb2F8qlpFranom4dXqzHHp+6sL8gtB0pns8l0kc4RGYw8lNGepuSNwsaOE4cMdzGshxqSefB7wCA==

The finished Try the sample card gets **Run its tests**, which opens the sample's support workflow on its Tests. For that
the workflow page opens on Configuration's Tests when its item is opened with `step: "tests"`. Each requirement gets one
sentence and an example; nothing else in them changes, and no test was weakened.

## Covers

- first-run.sample-card
- workflows.page.frame-and-states
