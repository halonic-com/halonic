# Decision: a failed plugin sign-out says to press Remove trust again

- Approval: Paperclip task HAL-15550 (words check C591 on HAL-15116, row 48; team decision on the approved Trusted sources screen, HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:K88FnG92VxBqLjqLTM+j6Ugryx69XLhHoUwrfgTUkLP06aaAFjq6ZkBhc9o9raAcmWtK/lT6F6HvWAyT17wdDw==

When **Remove trust** removed a plugin's record but couldn't sign it out, the dialog ended with
"Remove trust again to try the sign-out again." The words check found that "try the sign-out
again" turns the action into a noun, and that the sentence doesn't say which control to use. The
sentence now ends "Press **Remove trust** again to sign it out.", naming the button that's right
there in the dialog. It doesn't end in "try again", so the dialog needs no extra **Try again**
button.

Only the wording changes, in the requirement's text and its example. What the dialog does is the
same: the record is removed, the row stays with "Trust removed, not signed out", and pressing
**Remove trust** again signs the plugin out. No example, test or behaviour is removed or
weakened; the test that named the old sentence names the new one.

## Covers

- workspace.trusted-sources
