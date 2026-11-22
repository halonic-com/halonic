# Decision: repo checks read only what they mean to read, and print names safely

- Task: HAL-16334
- Approval: follows the release review's follow-ups that Liam assigned on HAL-16334; Liam signs this note in review, and Julian signs it as the second guardian because it changes trust roots (`tooling/check/src/lib/problems.ts`, `tooling/check/src/guard/`)
- Kind: user-visible

## What changes

- **Lockfile rule.** A registry package's `resolution` must have the exact shape pnpm writes:
  `{integrity: sha512-…}` with an optional `, tarball: https://…` after it. Anything else on that
  line, or another order or form of the fields, is an error ("has a resolution in a shape pnpm
  doesn't write"). The integrity hash and tarball URL are read from that shape only.
- **Annotations.** `formatAnnotation` escapes a finding's file name and rule as GitHub's
  workflow-command properties (`%`, line breaks, `:` and `,`) and its message as data (`%` and
  line breaks), so each finding stays one annotation on one line.
- **Licence check.** `pnpm check:licences` fails when `pnpm licenses list` returns no packages
  at all, instead of passing with nothing checked.
- **Guarded paths.** `.gitattributes` in any folder counts as the guard's own path and as a trust
  root, like the one at the root (`fallsUnder` in `guarded-paths.ts`, shared by the requirement
  guard and the note check).
- `pnpm who-touches` (in `tooling/discover`, outside the guard) prints control and formatting
  characters of pull request titles and branch names as `\u{…}`.

## Why

Follow-ups from the 0.1.2 release review (HAL-16334). Each check now fails closed on input it
can't read as intended.

## Tests

No test was weakened, skipped or deleted. Added: the lockfile shape, annotation escaping, the
empty licence listing, a nested `.gitattributes` as an own path and as a trust root, and the
escaped `who-touches` line. Each fails on the code before this change.

## Covers

- tooling/check/
