# Decision: client secret routes refuse any request that is not same-origin

- Approval: Liam reviews this on HAL-10725
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9hv4+Fpxt9S93Hd7PiFZlCdtgTbgb58NjLASilvdi19JlfKajV6YTJ2ZpikUNrriZ8xQDaNqJpIicGhrAhnVBA==

The agent host's client secret save and replace routes now answer `403` with `secret_from_other_site` when
the page's `sec-fetch-site` header says anything other than `same-origin`, before the body is read. A request
with no header still passes. Before, the host built a fresh request for the handler, so the page's header never
reached the check and a cross-site request was accepted. This note covers the edit to the active requirement
`agent-host.google-secret-routes` that describes this rule.

## Covers

- agent-host.google-secret-routes
