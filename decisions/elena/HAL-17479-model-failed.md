# Decision: a Build chat's failed model call says the provider's own sentence

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17479 (split from HAL-17334 in Liam's review; states H22 in HAL-5896, microcopy 14.1 "Model unreachable" revision 96 and 22 F7, F8)
- Kind: user-visible

`assistant.chat.failed` said every failed answer ends with "Couldn't reach the model: *reason*.".
Microcopy 14.1's "Model unreachable" row gives both chats the run page's sentence for the
provider instead, ending "then try again.", with **Try again** and **Open Models ›**. The
requirement now says that for a model the chat couldn't reach (F7) and a local model that didn't
fit in memory (F8), and keeps "Couldn't reach the model: *reason*." for any other failure. The
sentences come from the Runs feature's own list, so the chat and the run page can't drift apart.

No test was weakened: the two existing examples still hold, and three are added.

## Covers

- assistant.chat.failed
