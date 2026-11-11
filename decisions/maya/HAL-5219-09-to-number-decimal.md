# Decision: read a zero or four-digit decimal in `toNumber` as a decimal

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:itFc9zM7WMc/LUY9FdqCxwKZTFb6VIDXVRG/w3l4Jpe5bWw6js+eJrzluSqCMT2FwpMutHH20NVpORr1ThE5Cw==

`toNumber` read `0.125` as 125 and `3.14159` as 314159, because three or more digits after a separator counted as thousands. A thousands group has exactly three digits and never starts with zero, so the rule now is: the last separator is a decimal when one or two digits, or four or more, follow it, and also when exactly three follow a whole part that is empty or only zeros. With three digits after a non-zero whole part it stays thousands, so `€ 18.400` and `1,234` keep their documented values. `1.234` stays ambiguous and reads as 1,234; the requirement names that as a known limit. `0.001` now gives 0.001 instead of 1. Liam chose this rule on the task.

## Covers

- workflow.to-number
