# cli.commands.models.allow-address

- Status: active
- Since: unreleased
- Source: HAL-11873 (step B (c) of HAL-11343); the UX checklist on that task; Liam's decision on HAL-11931 (a run may not use it); the note for a key's first address is HAL-15346 (Iris's finding 1 on C561), the team's call under HAL-2282

The `halonic models allow-address <key-name> <address>` command shall add the address to the addresses the stored key may be sent to, keeping the key's other addresses, and print `✓ Allowed <address> for key "<key-name>".` with exit 0. When the key had no addresses before, so it was sent wherever the trust rule let it go and now goes only to this address, the command shall then print `Key "<key-name>" had no addresses before, so from now on it's sent only to <address>, not to its provider's usual address. To allow another one, run: halonic models allow-address <key-name> <address>`, with the key name as one shell word. The address shall be kept as its scheme, host and port, as the model check compares it; when the person typed more, the command shall first print "Only the address part is kept: <address>." An address that is already allowed shall change nothing and print "<address> is already allowed for key "<key-name>". Nothing changed." with exit 0. It shall change only the key it was given. It shall refuse, with its text on stderr and a non-zero exit, a key that isn't stored, an address that doesn't start with `https://` or `http://`, an address with a user name or password, a key that already has the most addresses, and a profile folder whose secrets file can't be read or written, in each case leaving the addresses as they were.

Before it reads its arguments or opens the profile, the command shall check whether the run marker `HALONIC_RUN_TOKEN` is in its environment, without reading the value. When it is, the command shall print "This command can't be run from inside a run." and "Run it in your own terminal, or use the Models page." to stderr, exit with the `denied` code and change nothing. No option or variable turns this off. It is a second layer: the sandbox, which denies a run the profile folder, is the boundary. It shall never print the key's value or a path.

## Examples

- Given a stored key `openai-key` allowed for `https://api.example.com`,
  when `halonic models allow-address openai-key https://gateway.example.com` is run,
  then it prints `✓ Allowed https://gateway.example.com for key "openai-key".`, and the key is allowed for both addresses.
- Given `https://gateway.example.com/v1/chat?x=1`,
  when it is run,
  then it prints "Only the address part is kept: https://gateway.example.com." and then the ✓ line.
- Given a stored key `openai-key` with no addresses,
  when `halonic models allow-address openai-key https://gateway.example.com` is run,
  then it prints the ✓ line and then `Key "openai-key" had no addresses before, so from now on it's sent only to https://gateway.example.com, not to its provider's usual address. To allow another one, run: halonic models allow-address openai-key <address>`
- Given an address that is already allowed,
  when it is run again,
  then it prints the "already allowed" line, exits 0 and writes nothing.
- Given no stored key `missing-key`,
  when it is run for that key,
  then it exits 4 with `There's no key named "missing-key". Save it with halonic secret set missing-key first.`
- Given `HALONIC_RUN_TOKEN` in the environment,
  when it is run,
  then it exits 7 with the refusal on stderr and the secrets file is as it was.
