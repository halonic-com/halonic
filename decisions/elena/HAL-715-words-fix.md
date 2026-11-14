# Decision: the refused sign-in sentence no longer says "Halonic's"

- Task: HAL-715
- Approval: Liam approves this note in review on the review task of HAL-715
- Kind: user-visible

## What changes

The sentence for a refused sign-in reads "Google no longer accepts the sign-in for x@example.com."
instead of "Google no longer accepts Halonic's sign-in for x@example.com." The rest of the sentence
and the other banners are unchanged.

## Why

Mara's words check (HAL-8749): on the own-app route the client is the user's own, so "Halonic's
sign-in" is confusing. The change applies one test expectation and the requirement's quoted text.

## Tests

No test was weakened or skipped. Two expectations in the test of the requirement quote the new
sentence.

## Covers

- google-setup.connector-problem
- packages/studio/features/google-setup/src/ui/connector-problem.test.tsx
