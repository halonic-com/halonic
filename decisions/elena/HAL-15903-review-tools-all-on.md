# Decision: Review tools when every tool is on, and "off until you review"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15903 (team wording under HAL-15645's decision on board-approved screens, HAL-2282; microcopy 27 revision 145, from the check on HAL-15901)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wSbkVCfX1Zl3HsawwxcqyWSGMiJRMc5nxelgFPCnvd64Bv3KwWGKr4puLdW5qVvMpW3xEyGBVhZIngUjMDreAA==

When no tool of a connector waits and some are on, its page had no line and no
**Review tools**, so the review's Approved group and its **Remove approval**
couldn't be reached: the board's promise on HAL-850 that a person can switch
off a tool they approved from the same screen. The page now says "3 tools are
on." ("1 tool is on.") with **Review tools**, as the CLI's review ends, and on
a phone the usual view-only line. **Try again** can hand focus to that line.
The connector's Status section says "Off until you review them" and
`"lookup" stays off until you review it.`, in HAL-15645's on/off words. The
run's line in the CLI and Studio says the same, with one tool in the
singular. Microcopy 27's "Nothing is waiting for your approval." is retired.
No test was weakened: the "no line" example now holds when no tool is on.

## Covers

- library.listed-tools-waiting
- library.connector-secrets-focus
- library.status-section
