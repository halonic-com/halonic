# cli.commands.validate.trust-refused

- Status: active
- Since: unreleased
- Source: HAL-16276, from Iris's flow check C692 (HAL-16271), item 3: `validate` said "No problems" for a provider file that `halonic trust` then refused; the words are decided by the team under the HAL-2282 rule

When `halonic validate` checks a workspace with a connector or provider file whose content the trust check refuses (`workspace.trust-content`, `workspace.trust-providers`), such as an address with a user name or password in it, it shall list an error on that file with the code `trust-refused`, giving the trust check's own reason and the fix, and never the address: "This file can't be trusted, because the address has a user name or password in it. Fix the address, and keep any password or key as a secret instead." The file still loads, so `halonic trust`, `halonic routines` and `halonic run` keep refusing it as they do. The error fails the check, so it shall exit 1. A file the trust check accepts shall get no such error.

## Examples

- Given a provider file `providers/gw.yaml` whose `baseUrl` has a user name and password before the host,
  when `halonic validate` is run,
  then it lists the error `trust-refused` on `providers/gw.yaml` with the trust check's reason, the output holds neither the user name, the password nor the host, and it exits 1.
- Given a connector file whose `http.url` has a user name and password before the host,
  when `halonic validate --json` is run,
  then its problems hold one `trust-refused` error for that file and no part of the address.
- Given a provider file whose `baseUrl` has no user name or password,
  when `halonic validate` is run,
  then it lists no `trust-refused` error.
