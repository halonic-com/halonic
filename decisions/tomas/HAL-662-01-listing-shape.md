# Decision: `ports.untrusted-tool-listings` caps how deep `parameters` nest

- Requirement: `ports.untrusted-tool-listings` (`packages/core/ports/requirements/untrusted-tool-listings.md`)
- Task: HAL-662, building the host side of the requirement written in HAL-559
- Approval: the maintainer owns the requirement and approves this change in review

## What changes

The requirement grows; nothing it promised before is taken away. Next to the 64 KiB cap, the host
also refuses a listed tool whose `parameters` nest objects and arrays more than 64 levels deep. One
example is added for it.

## Why

The host has to walk `parameters` to check the text caps and to rebuild them. 64 KiB of `[[[[…` is
about 32,000 levels, which runs any recursive walk, and `JSON.stringify` itself, out of stack. The
host would then fail with an error instead of refusing the tool, and a server could stop a whole
listing from being read. Real tool schemas nest a handful of levels, so 64 refuses none of them.

No test was weakened; the cap has its own test in `packages/core/app/src/listed-tool.test.ts`.
