# Decision: the agent host stops its proposal git, and says what a late session finds

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10849 (Liam, CTO; review notes on #3491)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Wx97tOTR74NWVYpdkoTq66Ggi6Bv/R6RdBwLiMlK2hqUsuD7WPybFmUCLONXHHGsRglyL+GbxmeAF4tNRfSKAg==
- Task: HAL-10849

Two notes from the review of #3491, both in the agent host:

- `agent-host.proposal-routes`: the host made a `lazyGitVcs` per workspace and never closed it.
  The host exited anyway, so nothing leaked, but now the host stops that git when it stops, after
  the runs and their sessions. Closing twice does nothing.
- `agent-host.profile-route`: the requirement now says what a session finds when it opens after
  the ten-minute timer removed its profile's temp folder: no temp folder, because the host doesn't
  make it again, so that session fails closed. This was already the behaviour; a new test pins it.

No test is weakened or removed; two tests are added.

## Covers

- agent-host.proposal-routes
- agent-host.profile-route
