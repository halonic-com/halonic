# Decision: `serve --public-origin` serves behind a proxy on the same computer, and four active requirements say so

- Task: HAL-18498
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17512 (Liam's `server-engine` plan rev 2, §4 and PR S7, with Julian's findings S3 and S10 from HAL-17513; Julian signs this security PR on its review task and Liam reviews the code)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:dlBxr270I3fyPPhMaf+htqFtERn9urgU5jBtIxE3ItvOwpBWVrFVSn8XKapF5FJdvXQ+yw62BH1Hqar1Q8fnBA==

`halonic serve --public-origin https://<host>` is new. It builds `server.public-endpoint`, which S0 merged as a draft, and sets it to active. Four active requirements gain one clause each, so that what they say stays true for a server with a public origin. None of them changes for a server without one, and no test is weakened or removed.

## What changes

- `server.public-endpoint`: `Status: draft` becomes `active`. One sentence is added: while no password is set, a server with a public origin refuses every request, its own name included. That is the same guarantee as "refuses to start without a password", kept if the password is removed while the server runs.
- `server.host-check`: a loopback name is accepted on any port "except by a server with a public origin, which accepts only that origin's host". Without a public origin, nothing changes.
- `server.response-headers`: HSTS is sent for a request made over `https` "or that the host vouches for as secure", and no `X-Forwarded-*` header makes a request count as secure. Before, the server sent HSTS only when the request URL said `https`, though the cookie and the `Origin` check already took the host's word (`RequestContext.secure`). No host sets `secure` today, so only a public origin changes what is sent.
- `runtime.listen`: with a `publicOrigin`, the Node listener binds to `127.0.0.1` only, gives the server that host as its only name, throws `PublicOriginNeedsPasswordError` without a password before it binds, and throws a `RangeError` together with `network`.
- `cli.commands.serve.serve`: `--public-origin` serves as `server.public-endpoint` says, and the first line names that origin.

## Why

Behind a proxy on the same computer, every outside request reaches `serve` from loopback, with whatever `Host` the proxy passes on. The loopback rules that keep a local server safe ("no password = signed in", `localhost` on any port) would then open it to the internet (Julian's S10). So the public origin replaces those rules instead of adding to them: one name, a password or nothing, and `secure` from the operator's configuration rather than from a header the client controls (S3).

## Covers

- server.public-endpoint
- server.host-check
- server.response-headers
- runtime.listen
- cli.commands.serve.serve
