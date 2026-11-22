# Decision: a stopped plugin's card and command dialog say what the page says, and point to Try again

- Task: HAL-15788
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15788 (flow check C630 #4, found on HAL-15782; wording is a team call under HAL-2282, recorded on HAL-15788)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yTIIckqwVtdLTCYHcd4GF3+XbnPkOR5jfgaHDEjVgmaRiDhyHUg8M635g/nQMDf+Rmi4L9jjnaci+rPmlyWfBA==

## What changes

Two active requirements are edited:

- `plugins.plugin-cards`: a card whose plugin the host stopped says "Halonic stopped *name*: the sandbox didn't work when it started, so none of it ran. Try again starts it in the sandbox again. Open *name* for details." with **Try again** and ↻; the second *name* opens the plugin's page. Before, it said "Halonic stopped *name*: its sandbox didn't hold, so it didn't run. Open *name* to check again."
- `plugins.plugin-commands`: the dialog's alert says "Halonic stopped *name*: the sandbox didn't work when it started, so none of it ran." with **Try again**, and under it "Try again starts it in the sandbox again. Open *name* for details." Before, the first sentence said "its sandbox didn't hold, so it didn't run" and the second "Open *name* to check again."

The tests that check those words now check the new ones; no test was weakened or skipped. What the card and the dialog do is unchanged: the name still opens the plugin's page, and **Try again** still calls the tool again.

## Why

One stop read four ways (C630 #4): the card and the dialog said "its sandbox didn't hold", the plugin's page (R15) and, since C599, the CLI say "the sandbox didn't work when it started, so none of it ran". The card and the dialog now use the page's sentence, so a person reads the same thing wherever they meet it.

"Open *name* to check again" sent people to the page's **Check again**, which only has the host forget the stop and tries nothing; its toast says the next run tries the sandbox again. The real retry is the card's and the dialog's own **Try again**, because the next call starts the runner in the sandbox again. So the line now says what **Try again** does, and links the page only for details.

## Covers

- plugins.plugin-cards
- plugins.plugin-commands
