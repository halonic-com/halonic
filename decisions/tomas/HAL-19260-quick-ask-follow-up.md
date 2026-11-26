# Decision: the agent button's name ends with a full stop

- Approval: Nina's copy check of quick ask on HAL-18787 asked for the full stop; this follow-up is HAL-19260, and Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:njspWf0OkPfM2GO7ngeOdvLVUg8fhm1iJFY6IntqiYkQxq74RHVlpLzl1NEWyecVBL9jJ44jbAyJAKTX2N9EDA==

## What changes

The requirement `quick-ask.box` named the picked agent's button "Ask {agent}. Change agent". It now names it "Ask {agent}. Change agent.", with the full stop Nina's copy check asked for, so a screen reader pauses after it as after the box's other sentences. The words file and the two tests that find the button by that name change with it. Nothing else in the requirement changes.

## Covers

- quick-ask.box
