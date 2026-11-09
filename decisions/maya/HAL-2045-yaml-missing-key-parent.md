# Decision: a missing key points at its parent's key line

- Approval: the package owner (Maya) approves this note; Liam reviews it in the pull request
- Kind: internal
- Task: HAL-2045

## What changes

`positionOf` in `@halonicjs/yaml` used to answer a missing key with the start of the parent map's
value, which for a block map is the line below the parent key. It now answers with the parent's key
when the parent is the value of a map key (`run:` on line 5, not line 6). Maps with no key of their
own (a list item, the top of the file) and missing list items answer as before. The
`yaml.position-of` requirement gains one example and a clause in its sentence; no existing example
changes.

## Why

The HAL-871 parity cases (`routine/no-hub`, `models/missing-required`) expect the parent key's line.
HAL-1523 pins the old line with a comment until this lands. `format` reuses `positionOf`, so its
problems move with it.

No test was weakened or removed.

## Covers

- yaml.position-of
- packages/core/yaml/src/position.test.ts
