# plugins.plugin-sign-in-page

- Status: active
- Since: unreleased
- Source: HAL-8613; Liam's security review of halonic#3941 (19 Nov); `plugins.plugin-sign-ins`

When the person presses **Sign in** or **Sign in again**, the Studio shall open the address the agent host answers only when it is an `https:` address on the sign-in's approved host, the host the trust check line names. Any other answer (another host, another port, `http:`, or no address) shall open nothing, and the block shall say "Couldn't start the sign-in: the page to open isn't on *approved host*." The page shall be opened through the shell's `openExternal`, with the address handed over inside the click, so a refused address closes the tab it would have used.

## Examples

- Given Acme's sign-in on auth.example.com,
  when the host answers `https://auth.example.com/oauth/authorize?client_id=abc123`,
  then the browser opens that address.
- Given the same sign-in,
  when the host answers `https://evil.example.net/oauth/authorize`, `http://auth.example.com/oauth/authorize` or `https://auth.example.com:8443/oauth/authorize`,
  then the browser opens nothing and the block says "Couldn't start the sign-in: the page to open isn't on auth.example.com."
