# Decision: cancelling at the provider says you cancelled it in the browser

- Approval: HAL-15682 (flow check C614, item 4, a follow-up of HAL-15419); Liam approves this note in review
- Kind: user-visible

## What changes

When the person presses Cancel or Deny on the provider's own page, the provider sends them back
with `error=access_denied` and the flow records the outcome `cancelled`, as before. The browser
tab now says "You cancelled the sign-in. You can close this tab and go back to Halonic." instead
of the generic "The sign-in didn't finish. Go back to Halonic to see why and to try again."
Nothing is exchanged and nothing is saved, as before. Every other unfinished outcome keeps the
generic line, and Cancel in Halonic keeps its own page from HAL-15419.

`integration-sign-in.sign-in-flow` gains one example for this page. No example was removed or
weakened.

The four tests about cancelling moved unchanged from `sign-in-flow.test.ts` to the new
`sign-in-flow-cancel.test.ts`, next to the new test, so the first file stays under the file-size
headroom. That is why fewer tests run in `sign-in-flow.test.ts`; the package runs the same tests
plus the new one.

## Why

The person just pressed Cancel, so telling them to go back to Halonic "to see why" sends them
looking for a reason they already know. Studio says "You cancelled the sign-in." for the same
outcome, and the page now matches it.

## Covers

- integration-sign-in.sign-in-flow
- packages/host/integration-sign-in/src/sign-in-flow.test.ts
