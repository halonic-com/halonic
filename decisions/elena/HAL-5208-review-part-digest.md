# Decision: a part's digest covers the baseline as well as the file

- Approval: the maintainer approves this change in review of HAL-5208
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yBGxkYWuNndhj1fgCK2wwGzw47YOGU8Ze04KK7Rpfbn6Sb6u9mYal+ptXMyuWbeuIgTnmyAncpfbxFhER+r1BA==

The requirements are tightened; nothing is narrowed and no test was weakened.

The digest the review service gives with a file's parts, and checks when one
part or change is accepted or rejected, now covers the baseline and the text
together instead of the text alone. Accept moves the baseline and leaves the
file alone, so a digest of the text alone stayed the same across it. The
review service also reads the record and the file in the file's turn when it
works the parts out.

The wording of the three requirements follows: stale now means the file or
the baseline is no longer what the parts were shown from, and the digest
`app.review-changes-in` gives is of both. One example is added to
`app.review-accept-reject-part`. The unsaved-text example of
`app.review-changes-in` now says what the digest is for (deciding a part from
unsaved text says stale) instead of naming its input.

## Covers

- app.review-accept-reject-change
- app.review-accept-reject-part
- app.review-changes-in
