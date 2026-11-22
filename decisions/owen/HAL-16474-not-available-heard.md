# Decision: Not available is heard the same after either check, and served Studio's words

- Approval: Paperclip task HAL-16474, design check C711 rows 1 and 2 on HAL-16447 (Noah); small fixes on an approved screen, decided by the team (HAL-2282), the words chosen by the designer on the task; Liam signs this note in review on HAL-16474
- Kind: user-visible

Design check C711 found two slips in Settings › Agent sandbox after #5235:

1. **Check again on a host check's Not available was heard as "Sandbox
   checked: " and nothing more.** #5235 moved the Not available words out of
   the view's lead, which is now empty, and the live region still read the
   lead. It now says what the start check's **Check again** says for the same
   reason: "Sandbox checked: not ready." and the reason. A removal that leaves
   Not available says the same words after "Sandbox removed.", instead of an
   empty line. A check that couldn't run, whose line sits in a Callout and so
   also left the lead empty, is heard as "Couldn't check the sandbox: …".
2. **Served Studio said "this computer" on a phone.** Its last line now
   reads "On the computer Halonic runs on, you can run an agent after a
   warning." Served Studio has no sandbox host, so its lines come from the
   start check, which also gave it the desktop fix; it now gets the fix for
   doing it on the computer (`phoneFix`), as a host check already did there.
   The desktop app keeps its words.

The requirements change only in this:

- `settings.agent-sandbox-not-available`: served Studio's fix and last line,
  and **Check again** on a host check's reason says the same "not ready"
  words; two examples are added.
- `settings.agent-sandbox-state`: served Studio's last line.

`settings.agent-sandbox-removal-result` (a draft) says a removal that leaves
Not available is heard with those words, with an example.

No test is removed or skipped. Settings' state test checks the new
`wayRound` field of the Not available words. `not-available.test.tsx` adds two
tests (Check again heard the same from either check; served Studio's words
from either check), and `removal-result.test.tsx` one (a removal that leaves
Not available).

## Covers

- settings.agent-sandbox-not-available
- settings.agent-sandbox-state
