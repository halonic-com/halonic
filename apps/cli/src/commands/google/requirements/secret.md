# cli.commands.google.secret

- Status: active
- Since: unreleased
- Source: HAL-717 (D1); Google setup flow design 4.1 and plan D6; `google-setup.client-secret-store`

The `halonic google secret <account>` command shall save the Google client secret of the setup record `<account>` (the account ref the Studio made) by the rules of the Studio's `PUT /api/google/setups/<ref>/secret`: a first secret is saved and recorded, a saved one is replaced only while the account has never signed in and no other account uses the client, and otherwise nothing changes and it exits 5 with a line that points to the Studio. It shall read the value from the hidden prompt "Client secret: " only, never from an argument, an environment variable or a pipe, and a second argument shall exit 2 without prompting. It shall print "✓ Saved." with exit 0 and nothing else of the value or the setup. It shall exit 4 for a ref that has no setup, and exit 2 without prompting when nobody can type, with `CI` set or `--json`. Before the prompt it shall find the profile's `token-key`, or make it while no token is sealed (`token-store.made-token-key`, HAL-13855), and stop with exit 5 and a fix line when the key is gone but sealed tokens remain. The secret shall not appear in any line printed, in an error, or in the profile's files except sealed.

## Examples

- Given a setup with no secret and a terminal where `fake-secret-value` is typed,
  when `halonic google secret <account>` is run,
  then it prints "✓ Saved." and the setup record names a client whose sealed secret opens to `fake-secret-value`.
- Given `halonic google secret <account> fake-secret-value`,
  then it exits 2, prompts for nothing, saves nothing and prints no `fake-secret-value`.
- Given an account that has signed in,
  when a new secret is typed,
  then the saved one stays and the command says to replace it in the Studio.
- Given a fresh profile with no `token-key`,
  when a secret is typed,
  then it prints "✓ Saved.", and the profile's secrets file holds a `token-key` that opens the sealed secret.
- Given no `token-key` but a sealed token in the profile,
  then it exits 5, asks for no value, saves nothing and makes no key.
