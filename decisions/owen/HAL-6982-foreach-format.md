# Decision: a foreach item with gets and no input gets the picked data

- Approval: [HAL-6982](/HAL/issues/HAL-6982) asks for this change; Liam approves it in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zmtBsKopcHp7kxg0ouXaOyensFS+l8hzIrQRHml3hOX9ryACv84GsbSerfNGU/OiFb921jLa1rZeKCevn0CoBg==

## What changes

`engine.foreach-state` said that a for-each item with no `input` is asked "the item itself as text
or JSON". With `gets`, that dropped the picked data. The requirement now says the item, like an
`input` or a method's prompt, is followed by the picked data, and points to the new requirement
`engine.foreach-item-gets`. Nothing else in it changes, and no test, requirement or golden file is
removed or weakened. A state without `gets` still sends the item alone.

The same pull request adds `engine.step-format`: a step's `format` decides how its answers are
checked and how the model is told to reply. That one is new and changes no existing requirement.

## Why

E8 in HAL-185's engine bug decisions: the picked data is what `gets` is for, and the other two
prompt shapes already add it. Leaving the old sentence would contradict `engine.foreach-item-gets`.

## Covers

- engine.foreach-state
