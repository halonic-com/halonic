# Decision: two more attack cases for the integration conformance suite

- Requirement: `integration.attack-cases` (`packages/testing/integration/requirements/attack-cases.md`)
- Task: HAL-1408, a follow-up from the review of PR #437 (HAL-1397)
- Approval: the package owner asked for this change in the task and approves this note in review

## What changes

The requirement names two more attacks the suite must fail. Nothing it promised before is taken away.

- An integration that sends a request as soon as it connects, before any tool is called. The
  `connect` check already failed it ("connecting sent 1 request(s)"); no attack case proved it.
- A tool that resolves without a value. The `case` check already failed it ("returned nothing");
  no attack case proved it.

## Tests

No test was weakened or removed. `attacks.test.ts` gains the `connect` check, so the well-behaved
integration now also has to pass it, and the two new fixtures in `fixtures/attacks.ts` each must
fail with their check's own message.
