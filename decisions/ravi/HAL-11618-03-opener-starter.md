# Decision: the sign-in browser opener may start the system's own opener

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11618
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WtowpiZQQgzfZ2/R1l1n/tNeeu2radsEFldYYZVMcZuF28RTJ8O+EDB44JJe+v4v3U6ERcOjpkPjmUsCH2RjCg==

Signing in to a provider from a local integration needs the user's browser to open at the provider's
page. The only way to do that from Node is to start the system's own opener, so
`packages/adapters/sign-in-loopback/src/system-browser-opener.ts` needs an entry in
`tooling/check/process-starters.json` (HAL-11618, HAL-8613 part A).

The entry merges first and the code follows in its own pull request, as `docs/guides/checks.md`
asks (the rule only warns while the file doesn't exist). The file will start `open` (macOS),
`rundll32 url.dll,FileProtocolHandler` (Windows) or `xdg-open` with one argument, an `http` or
`https` address the sign-in flow built, never through a shell. Any other address, including a path
under a skill's `scripts/` folder, is refused before anything starts; the entry's `scriptsTest`
arrives with the code and shows it.

No rule, test or threshold is changed.

## Covers

- tooling/check/
