# cli.commands.google.secret

- Status: active
- Since: 0.1.0
- Source: HAL-717 (D1); Google setup flow design 4.1 and plan D6; `google-setup.client-secret-store`

The `halonic google secret <account>` command shall save the Google client secret of the setup record `<account>` (the account ref the Studio made) by the rules of the Studio's `PUT /api/google/setups/<ref>/secret`: a first secret is saved and recorded, a saved one is replaced only while the account has never signed in and no other account uses the client, and otherwise nothing changes and it exits 5 with a line that points to the Studio. It shall read the value from the hidden prompt "Client secret: " only, never from an argument, an environment variable or a pipe, and a second argument shall exit 2 without prompting. It shall print "✓ Saved." with exit 0 and nothing else of the value or the setup. It shall exit 4 for a ref that has no setup, and exit 2 without prompting when nobody can type, with `CI` set or `--json`. It shall stop before the prompt with a fix line when the secret `token-key` isn't set. The secret shall not appear in any line printed, in an error, or in the profile's files except sealed.

## Examples

- Given a setup with no secret and a terminal where `fake-secret-value` is typed,
  when `halonic google secret <account>` is run,
  then it prints "✓ Saved." and the setup record names a client whose sealed secret opens to `fake-secret-value`.
- Given `halonic google secret <account> fake-secret-value`,
  then it exits 2, prompts for nothing, saves nothing and prints no `fake-secret-value`.
- Given an account that has signed in,
  when a new secret is typed,
  then the saved one stays and the command says to replace it in the Studio.
- Given no `token-key`,
  then it asks for no value and saves nothing.
