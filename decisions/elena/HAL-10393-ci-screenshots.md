# Decision: upload Studio screenshots as a CI artifact

- Approval: Liam reviews this on HAL-10393; the screenshots are decided on HAL-10392
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GkCIQIKASuj3y2VCr+FujaPgOVxvZCEFyhuHalHUysvOXPdmejLZlsTgqN8VMNZtiYK5TFDPDPKau4a+gQJ1Bw==

The `e2e` job in `.github/workflows/ci.yml` gets a second Playwright step and an `actions/upload-artifact` step
(`studio-screenshots`, 7 days), so light and dark screenshots of Studio screens can be downloaded from CI without a
local browser. It is the only change under `.github/`.

## Covers

- .github/
