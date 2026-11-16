# Decision: a phone offers no Delete on Knowledge and Connectors

- Task: HAL-10955
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-606 (flow-library 8.1, approved) and https://paperclip.halonic.com/HAL/issues/HAL-949 (phone layout 1.1, approved; text confirmed on HAL-11166); Liam signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3yeXNwlncxM38j4poCC2cx0UTfkYVDNbCKxlzRkpKooi/CHB+3dPheJ13/vksi/ug1h84cEG4LqhOsLw7JMrDw==

## What changes

`library.library-phone` gains a paragraph: on a phone, Knowledge and Connectors rows and pages don't offer Delete. Skill and collection rows and pages keep it. Four examples describe the row menus and the page menus.

No test was weakened or skipped. New tests cover the rows and the pages on a phone.

## Why

A phone can't make a knowledge source or a connector again, so it shouldn't remove one either. This is what flow-library 8.1 and the phone layout 1.1 already say; the requirement now says it too.

## Covers

- library.library-phone
