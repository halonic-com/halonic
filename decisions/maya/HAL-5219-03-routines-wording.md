# Decision: interval triggers say UTC

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ywmbM8ST/o5ijADcThzEzQ7taVkUBT5wiy4+3MHH6Wlnqg1fzHyhvTFQTlwH7hHLoDVswDRWccy3uqLcNO4PDw==

The describe-trigger requirement says an interval of whole hours or days reads with "(UTC)" after it. The existing expectations are updated to the new text; no test is removed.

## Covers

- routines.describe-trigger
