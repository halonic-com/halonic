# cli.commands.secret.set

- Status: active
- Since: 0.1.0
- Source: HAL-195 (9a-2c); phase 4 plan on HAL-9 (`halonic secret` reads the value from a prompt or stdin, never an argument); `app.secret-service`, `cli.secret-prompt`

The `halonic secret set <name>` command shall save the secret `<name>` through `SecretService.set` and print "✓ Saved <name>." with exit 0. It shall read the value from a hidden prompt, "Value for <name>: ", when stdin is a terminal, and from stdin, without its last line ending, when stdin is piped; it shall never take the value from an argument, and a second argument shall exit 2 with "A secret's value can't be given as an argument." It shall refuse a name the service refuses before it asks for a value, and a value the service refuses, with the service's reason and exit 2. For the sign-in password it shall ask "Sign-in password: " and "Sign-in password again: " at a terminal, and use the one piped value for both. With no value, or an empty one, on stdin it shall save nothing and exit 2. Where nobody can type, with `CI` set or `--json`, on a terminal, it shall ask nothing, save nothing and exit 2 with how to pipe the value in. It shall never print the value, also in an error or with `--debug`.

## Examples

- Given a terminal where the user types `sk-live-1234` at the prompt,
  when `halonic secret set openai-key` is run,
  then it prints "✓ Saved openai-key." and the profile's secrets file holds the value under that name.
- Given `sk-live-1234` piped in,
  when `halonic secret set openai-key` is run,
  then the saved value is `sk-live-1234`, without the line ending.
- Given `halonic secret set openai-key sk-live-1234`,
  when it is run,
  then nothing is saved, it exits 2 and neither line printed contains `sk-live-1234`.
- Given the name `token-key`,
  when `halonic secret set token-key` is run,
  then it asks for no value and exits 2 with the service's reason.
