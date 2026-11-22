# Decision: the run log's "Allow this address?" lines name the dialog and the provider

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15914 (flow check C651 #3 on HAL-15910; small wording on the approved "Allow this address?" flow, decided by the team under HAL-2282, no board card); the reviewer signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4B+VADDXnHstct80cX8vc3wIyhEllU5/be55oR8l/h4BwqpdfIsNs26txhJcUdAbL3dDQw8k6ZIzc5qH8XxwDQ==

## What changes

1. `runs.run-view.key-origin-asked`: the question's line starts with the dialog's name, so a person matching the
   log to what they saw has a word in common:
   `Allow this address? Asked whether provider "Gateway" may send key "gateway-key" to https://gateway.example.com.`
   Before, it began `Asked whether provider …` and never said "Allow this address?".
2. `runs.run-view.key-origin-answered`: the Allow line names the provider, in the form the Don't allow line already
   has: `Allowed: provider "Gateway" may send key "gateway-key" to https://gateway.example.com.` Before, it read
   `Allowed https://gateway.example.com for key "gateway-key".`, so two providers with a key of the same name read
   the same. The Don't allow line doesn't change.

Why these words: the dialog's own title goes first, as written in the dialog, and the rest of the question stays as
#4909 shipped it. The Allow line mirrors `Not allowed: provider … can't send key … to …`, so the two answers read as
a pair. `halonic models allow-address` keeps its own `✓ Allowed <address> for key "<key>".`: that command adds an
address to a key and has no provider. Neither line has been released, so there is no changeset.

No test is weakened: the two run log tests that check these lines now expect the new words.

## Covers

- runs.run-view.key-origin-asked
- runs.run-view.key-origin-answered
