# app.ask-approvals

- Status: active
- Since: unreleased
- Source: HAL-5397 (security conditions N1a, N6, N7, N8); HAL-3779 design (section 7)

While a run is in ask mode, the app shall pass every tool call of the harness through the ask policy. A call the policy allows shall run without asking, one it refuses shall be rejected without asking, and every other call shall go to a person. The card for a shell command shall show the whole command with every control and bidirectional character written out as `\u{…}`, never cut it off, say that the command can run other programs and that the answer covers this call only, and warn when the command is longer than 2,000 characters. No answer within the time limit (five minutes unless set) shall be a no, and the pending question shall be withdrawn. Nothing shall be remembered between calls, so every call asks again. A run that has no way to ask a person shall not start in ask mode.

## Examples

- Given an edit of `src/a.ts` in the project, then it runs without a question.
- Given `Bash` with `ls`, then a person is asked, and the card holds the command, the note and no "allow always".
- Given a command with a right-to-left override character, then the card shows `\u{202e}` in its place.
- Given a command of 3,000 characters, then the card shows all of it and a warning.
- Given a question nobody answers for five minutes, then the answer is no.
- Given a run without a way to ask, then ask mode throws `harness-cant-ask`.
