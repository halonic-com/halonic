# Decision: the trust check marks hidden characters and labels a program's path "Runs"

- Task: HAL-16420
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16420 (the visual check C706 rows 1 and 4 on HAL-16419, following mockup-trust section 5 and microcopy 4.3, which the board approved; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kTT/IMehYudjBJbVRbK7hHe0Y2YvFYjzPMGTq53S08UDmqUVgFDb856XKXCXGfnSZpdwml91PN0i60vYahn/CQ==

## What changes

`workspace.trust-check-escaped` no longer shows a control or bidi character as the terminal's
`\u202e` code. The trust check now writes each hidden character as a marker such as `⟦U+202E⟧`,
in amber, the form the plugin trust check and the Inbox already use. The hidden set is
`@halonicjs/std`'s, so zero-width characters, the soft hyphen and tag characters are marked
too, where `printable` let them through unseen (an env entry with a zero-width space between
`hi` and `there` read "hithere"). Tab and
newline are marked as well, as `printable` did, because a one-line value would show them as a
space. Its test now checks the markers, the zero-width and newline cases and the amber colour; no
check was dropped.

`studio.trust-review-program-fields` calls a program's path **Runs** instead of **Resolved
path** (microcopy 4.3, "Open program row: **Runs** *resolved path*"), and says its values are
code, shown in mono. Its test expects the new label and the `code` tone on each line.

## Why

Hidden characters read as text someone typed in the file, and zero-width ones stayed hidden. The
label didn't match the approved microcopy (C706, HAL-16419).

## Covers

- workspace.trust-check-escaped
- studio.trust-review-program-fields
