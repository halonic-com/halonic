# Decision: a place's view can push a list on a phone

- Task: HAL-11294
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-606 (flow-library 8.1, approved) and https://paperclip.halonic.com/HAL/issues/HAL-949 (phone layout 1.1, approved); Liam signs this note
- Kind: user-visible

## What changes

`shell.studio-phone` gains a sentence and an example: a place's view can push a list above its page (`openPlaceList`, key `place/sub`). The top bar shows the title the view gave, **Back** leads to the place's page and the bottom navigation stays. Pushing another list of the same place from it replaces the list, so Back never walks through several lists. The Library uses this for its phone list of kinds.

No test was weakened or skipped. New tests cover the push, the replace and Back.

## Why

The phone's Library is a list of kinds, each kind a page above it (phone layout 1.1). The shell needs a way to push such a page that any place can use.

## Covers

- shell.studio-phone
