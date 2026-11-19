# Decision: a run that failed at the proxy says so in the desktop app

- Task: HAL-13725
- Approval: decided by the team on HAL-13725 (error text on an approved screen, HAL-2282 rule; Sofia's check HAL-13691 of #3799). Liam signs on review; Elena agrees the Runs line on the pull request.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MLoYYxlNqqZL86+imGnzhW/vtbPwBuCXeuLY+462IMi2diAVOCacultuWH6TlMhhLcPxk/VuyRJuDvTtSz3NBA==

In the desktop app, a model call that the shell refused at the proxy (`proxy_refused`,
`plain_http_proxied`, `proxy`) failed the run with no typed cause, so the run page said "This
computer may be offline. Check your internet connection, then run again." to the person behind a
company proxy, and the shell's sentence that says what to change never reached them.

The shell's HTTP client now throws these refusals with the CLI's typed proxy causes
(`proxy.setting`, `proxy.plain-http`, `proxy.unreachable`, with the kit kinds of `ProxyError`)
and the shell's sentence as the message and in the cause's `detail`. The run page's
`model-unreachable` banner reads a `proxy.*` cause first: "Halonic couldn't reach *Claude* at
api.anthropic.com through your proxy: *the shell's sentence*", with **Model calls through a
proxy**, which opens the how-to.

The requirements `services.shell-http-client` and `runs.run-view.failure-banners` gain these
sentences and an example each. Nothing is removed or loosened: every other refusal and every
other `model-unreachable` run reads as before. The banner's rule that the engine's error text
never shows still holds; the proxy sentence comes from the typed cause, written for the person by
the HTTP client.

The how-to is linked on GitHub until docs.halonic.dev publishes it.

## Covers

- services.shell-http-client
- runs.run-view.failure-banners
