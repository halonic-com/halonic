# Decision: a missing value equals nothing in guards

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wbUR21TDM7q/cXPUSAkgUSTJlRn9P+m4y0xf3+5FctwxGB9QecAYjnOnnWuJF4H2Wt5HSnu6mDqM6/6mFCN7DQ==

The guard requirement gains one sentence and one example: a missing value is not the same as another missing value, so `equals` fails and `notEquals` passes. No test is removed.

## Covers

- workflow.guard
