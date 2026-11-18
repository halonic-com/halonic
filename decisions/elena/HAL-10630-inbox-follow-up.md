# Decision: The served Inbox listens to the page's own window

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10630 (Liam's review of #3317, which asked for these three fixes)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8eu5FgSk7lry8MNfWZUnMoPJ0PD/4FTV3C+sQJrTUpGy8LBk/3BKtLjdu+FT4UqpH4qdSAjFproki51VudhmBg==

The served Inbox now refreshes on the focus event of the page's own window, not the global one, and a test shows
`stop()` removes that listener. `studio.served-inbox` says `Since: unreleased` and gains examples for window
focus, stop and nothing waiting, each with a test. What a user sees and does is unchanged, and no test was weakened.

## Covers

- studio.served-inbox
