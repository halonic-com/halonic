# Decision: a window close that waits too long for a save asks instead of closing

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11252 (Liam's decision on the task, 16 Nov; the wording is a small addition to the approved "Close Acme?" question)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jYJ/kUfnROl9pTyFd7k+yBaEj9Dylyahga0iHMO4PZuepPt/YUBC2ykV62hkVlAFV6MYCS3xqw5u8lbsmpNpBw==

`workspace.saves-itself` promises a question before changes are thrown away. When the person closed
the window, the app waited 5 seconds for the saves and then closed the window whatever happened, so
a slow save, or a save that threw, lost its changes without a word. The 5 seconds were chosen so a
hung save can't keep the window open for ever (HAL-8048).

Now, when the limit passes or a save throws, the window stays open and asks "Close Acme?" with
"Acme is still saving." (or the failed reason). A failed save offers the three answers it always
did. A save that is still running offers only **Wait** (focused) and **Close anyway**, because
**Try again** would start a second save beside the first. **Close anyway** gets the person out, so
a hung save can't trap them: it closes that workspace and throws its changes away, as on a failed
save, and the window goes the next time they close it. The limit stays 5 seconds. If the save works
before they answer, the window closes by itself. The requirement gains this case
and two examples. No test was weakened or skipped.

## Covers

- workspace.saves-itself
- studio.entry
