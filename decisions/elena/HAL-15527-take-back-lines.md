# Decision: Take back's result lines say where to allow again and why it failed

- Task: HAL-15527 (flow check C587 #5, HAL-15498)
- Approval: team wording (HAL-2282), building on R16's approved Take back; Elena decided the words on HAL-15527; Liam signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MuoCn+WSNayfZHAIsbN60WvR2RTEOcjbDU6YWLIHOPPcOa8yPuXB8fMCNBUNSs9IO4jDSnurRWPe+0Nnzvh/AQ==

## What changes

`settings.unfenced-yes-take-back` changes in three places:

1. "Taken back." now ends "… until you allow it again. Halonic asks again the next time one starts." The hint
   under **Take back** said how the yes is given again, but it goes away with the button, so the result line keeps
   that half.
2. A refused Take back names the agent host's kind in plain words where it has one (`take_back_failed`: "Halonic
   couldn't remove the saved yes.", `io`: "Halonic couldn't write to your profile folder."), instead of the
   generic sentence every host kind got before, because `errorReasonFor` reads any kind outside the standard error
   kinds as internal. The block reads the status again first and adds "The yes is still saved." only while it
   still shows the yes; a line it can't put under **Take back** reads under the heading.
3. The host's `take_back_incomplete` means the yes is gone though some plugins didn't stop (agent host README and
   `agent-host.unfenced-runs-routes`). Settings used to call that a failure and keep showing the yes; it now says
   "Taken back, but some plugins and integrations didn't stop." as a warning, reads the status again and moves
   the focus to the heading.

No test was weakened or skipped. The existing tests now expect the new words; new tests cover the two kinds, the
incomplete answer and a refusal after which the status shows no yes.

## Covers

- settings.unfenced-yes-take-back
