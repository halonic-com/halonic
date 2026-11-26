# Decision: the plan-limit card answers a Continue that changed nothing

- Task: HAL-19122
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19110 (Noah's visual check of #6330 and #6328, item 1; words checked by Sofia on a child task of HAL-19122)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dTYaQD/eLkWqFSTrk0j2X/M2bDWMTCSFZNm2ycAu4pN0Li7WgkMoBRFqxG6bowxupLP9DUNhrbVtk7RniRPdDA==

## What changes

`inbox.plan-limit-card` said that when the run still waits at its plan limit after **Continue the
run**, the card stays as it was, with no new error. It still does, and now also shows one quiet line
over its buttons, said to a screen reader too: "This run is still at your plan's limit. It resets on
{day}.", without the second sentence when the stop gives no day. The example for that case gains the
line.

The test for that case (`packages/studio/features/inbox/src/ui/plan-limit-card.test.tsx`) no longer
checks that the card's whole text is unchanged, since the line is new; it checks that the title is
unchanged, no error shows, the line shows and is announced, and Continue is still there.

#6353 (HAL-19119) merged a narrower answer to the same press while this note was in review: it only
announced "The run is still waiting at your plan's limit.", and its test checked that sentence. This
change replaces that sentence with the line above, so it deletes that word and that one test: the
test above checks the same card (title unchanged, line announced) with the new words. #6353's other
test, that nothing extra is said once the run goes on, stays. Its changeset now names only the
banner part.

## Why

Without it the button showed "Continuing the run…" and went back to the same card, which reads
like a broken button, and a screen reader heard nothing (Noah, HAL-19110).

## Covers

- inbox.plan-limit-card
- packages/studio/features/inbox/src/ui/plan-limit-card.test.tsx
