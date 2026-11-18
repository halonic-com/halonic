# Decision: the kit exports ExternalLink's web-address rule as isWebAddress

- Task: HAL-12345 (finding L4 of the P10 security review, HAL-1743)
- Approval: the task asks for this change; Liam approves this note in review on HAL-12345
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gmT/zkucAcAy14Vr3EqOcyqYfiiC+Kt8gZpwS3fV/n8t37xHkZCEP0JMp0Fw3g21dcEi0QP0RWLjaKimyW4OAQ==

## What changes

`kit.external-link-web-only` gains one clause: the kit exports the rule `ExternalLink` uses as `isWebAddress`. Each example adds what `isWebAddress` says for its address. The rule itself, and what `ExternalLink` throws, don't change. The plugins' Markdown reader imports `isWebAddress` instead of keeping its own copy.

## Why

The Markdown reader decided by itself which links to draw, and `ExternalLink` throws on any address it doesn't take. If the two copies drifted, a plugin's answer could draw a link that throws, and the plugin card would crash. With one rule, they can't drift.

## Tests

No test was removed or weakened. `external-link.test.tsx` now also checks `isWebAddress` for every address in the examples.

## Covers

- kit.external-link-web-only
