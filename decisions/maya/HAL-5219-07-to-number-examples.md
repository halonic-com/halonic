# Decision: show the thousands reading of `toNumber` in its requirement

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:H1T0OZMqK7brW4H26cHt9TSEVTFtaZPuZYAYJu/RY76I/vRF+zu/O8puusGFhZS+bJoGkdx58XaprVz4Yv01CQ==

`toNumber` reads three or more digits after a lone separator as thousands, so `0.125` gives 125. That is what the requirement says, but no example showed it and the doc comment didn't warn. This adds the two surprising examples to the requirement, a line to the doc comment and a test. The behaviour doesn't change. Whether it should (read a lone separator before three or more digits as a decimal) is a separate decision on the task.

## Covers

- workflow.to-number
