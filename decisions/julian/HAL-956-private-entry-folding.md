# Decision: `ports.definition-store-private-entries` names the case-folding aliases

- Requirement: `ports.definition-store-private-entries` (`packages/core/ports/requirements/definition-store-private-entries.md`)
- Task: HAL-956, a follow-up from the security review of HAL-896 (#311)
- Approval: the maintainer owns the requirement and approves this change in review

## What changes

The requirement grows; nothing it promised before is taken away. "Ignoring case" now says it means
case as any file system might fold it, and names three letters that fold to ASCII: a long s
(`ſ`, U+017F) to `s`, the ligature `ﬆ` (U+FB06) to `st` and a dotless i (`ı`, U+0131) to `i`. One example is
added for them.

## Why

Both copies of the check compared names with `toLowerCase()`, which leaves these letters alone. A
case-insensitive APFS volume folds `.ſtudio` to `.studio`, and NTFS upper-cases a dotless i to
`I`, so a folder adapter could have written `.studio/trust.json` or into `.git` through such a name.
The check now upper-cases before it lower-cases, which maps all of them. A scan of every code point
found no other letter that case-maps into the names the requirement lists (the Kelvin sign maps to
`k`, which none of them holds).

No test was weakened; the three paths are now in `privateDefinitionPaths`, and the meta-test in
`packages/testing/contracts/src/definition-store.test.ts` requires each of them.
