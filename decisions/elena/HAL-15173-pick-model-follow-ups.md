# Decision: Pick a model's no-service case runs once, not twice

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15173 (Liam's review of the build 4 stack on https://paperclip.halonic.com/HAL/issues/HAL-13432: "[nit] One `it.each` in the view tests runs the same case twice")
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kjNdRtREPAfZ+MMHQ1SjU8GSUZbiOZ67csLoZ/BY/lmtCey07mwrqdN1mLHyQ6LBOELBbAOmuVg1eAkUH6SSDg==

`pick-model-screen.test.tsx` had an `it.each` over two labels, "the browser demo" and "a browser on
halonic serve, before it has the service", but both rows opened the screen the same way, with no model
choice service, and ran the same nine checks. The review asked for one case, so it is now one `it` with
the same nine checks, and a comment names both places that open the screen without the service.

That drops nine expect calls, and the new fieldset test adds seven, so `first-run.pick-model` goes from 96
expect calls to 94. Nothing it checked before goes unchecked: every check of the removed row still runs in
the remaining one, on the same input.

## Covers

- first-run.pick-model
