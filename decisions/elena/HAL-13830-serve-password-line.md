# Decision: `secret set serve-password` says that every sign-in ended

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13830 (PW1, decided by the team on the C248 check)
- Kind: user-visible

Since #3921, saving the sign-in password ends every open sign-in, but the command only printed
"✓ Saved serve-password.". For this one secret it now prints a second line, "  Every browser and phone
that was signed in has to sign in again." The requirement gains that sentence and an example. Every
other secret, and `secret remove`, print what they printed before, and no test was weakened.

## Covers

- cli.commands.secret.set
