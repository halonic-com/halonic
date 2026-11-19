# Decision: the sandbox badge's name holds its words, and a broken saved sandbox keeps a badge

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13743 (decided by the team on an approved component, HAL-2282: Sofia's C226 check of #3423; the badge itself is HAL-3777's)
- Kind: user-visible

Nothing here is mounted yet (W3, HAL-13321), so no person has seen the old words. Four points from the check:

**SB1.** The badge showed **Sandbox: on** but its screen-reader name was "Sandbox status: ready. Opens
sandbox settings.", so voice control couldn't find it by what it shows (WCAG 2.5.3 Label in Name). The
name is now the badge's visible words and then the action: "Sandbox: on. Opens sandbox settings.", and
the same for **No sandbox**, **Sandbox: setup unfinished** and **Sandbox: check failed**.

**SB2.** A saved backend that was no longer available, or that needed setting up for a reason other than
the restart, showed no badge, so the header looked as if nothing had been chosen. Now `not-available`
reads **Sandbox: check failed** (red), as `check-failed` already did, and any `setup-needed` reads
**Sandbox: setup unfinished**. No badge stays for: no choice yet, nothing proven yet, still asking, and a
host that can't answer.

**SB3.** The reason after "The sandbox isn't ready:" was lower-cased whole, giving "wSL isn't installed
yet" and "windows needs to restart", while "Couldn't check the sandbox:" kept "The engine". One rule for
both lines now: lower case after the colon, unless the first word is a name or an abbreviation (WSL,
Windows, Linux, macOS, Docker, Halonic, MXC, Microsoft, Ubuntu, or a word with capitals inside it). The
runs feature's RW1 (HAL-13724) does the same for its own colon with a list of common words; once both
are on `main`, one shared helper in the kit can replace the two.

**SB4.** **Checking** while the host is still asking now offers the busy **Check again**, as the
saved-but-unproven case did. A saved "none" without the asking promise has no line under **No sandbox**
instead of repeating "No sandbox.".

The requirement says all four and gains two examples; the tests that quoted the old name and line now
quote the new ones, and new tests cover each point. No test was skipped or removed.

## Covers

- settings.sandbox-status-view
