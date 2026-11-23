# Decision: the phone says how it connects by address again, and the off-options banner links its how-to

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16705 (flow check C750 on HAL-16697, findings 1 and 2; wording on approved screens, a team decision under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:y0DfTxjnmz8B0apJ0n2MHBsunF1C3w8Wyqfzdd0X20DSLpcYQTBLOdVl6YVGey0Tam7bRp4Ij/t49/5uMxuZAw==

Two findings from flow check C750, fixed together.

1. `studio.connect.tunnel-stays-home` said the connect screen shows only after "Connect with an
   address", a label the phone app doesn't have. It now names the real one, "Not listed? Enter its
   address" in Pair with a computer. The behaviour doesn't change. The Paired computers note (draft
   `remote.phone-paired-computers`) also says that once no computer is paired, the phone connects to
   its saved address again when it opens, if it has one, as the launch rule decided on HAL-16439
   does. A phone that has only ever paired opens Pair with a computer instead.
2. `runs.run-view.failure-banners`: both `answer-not-an-option` banners get **Handle an answer a step
   can't use ↗**, which opens `docs/how-to/handle-an-answer-a-step-cant-use.md` (`answerRetries` and an
   `unusable` transition), after the step's own links, as the proxy banner links its how-to. The
   sentences don't change, and no test was weakened: the test that said the banner has only **See the
   step** now also expects the how-to link.

## Covers

- studio.connect.tunnel-stays-home
- runs.run-view.failure-banners
