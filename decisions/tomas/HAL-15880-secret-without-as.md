# Decision: a secret with hosts and no as says to add as

- Approval: the task HAL-15880 asks for this change, a follow-up to HAL-15751 from Nina's flow check C619 (HAL-15734, item 2). The team decides it under the HAL-2282 rule, since it rewords a message that is already there, for one case. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hsnbUnhz79jbSgv/Jgxtdx9XCyS8lhZeq8hsM7BREUp1MkjldfvPFLNCxu+/AhQepiTMxkCxNJLhhycDovuwDg==

## What changes

- New requirement `format.integration-secret-without-as`: an `integration.yaml` secret with `hosts`, `header`, `field` or `prefix` and no `as` gets one problem, `Secret "<name>" has <fields> but no as, so it reads as a sign-in's client secret, which has only purpose. Add as: bearer, as: header (with header) or as: form (with field) to say how the kit sends it.`, in place of one `There's no field "<field>" in "secrets.<name>".` per field. The code (`unrecognized_keys`) and the path (the entry) stay the same; `keys` lists the fields it names.
- `FileKind` gets an optional `wordIssues`, which `parseFile` runs after the shared wording, so a kind can word a case only it can explain. Only the integration kind uses it. `format.missing-key-words` doesn't change: every other kind, and every other unknown field, keeps its words.

## Why

Without `as`, the secret union reads the entry as a sign-in's client secret, which has only `purpose`, so the shared wording said `There's no field "hosts"`. That points away from the fix: the author meant a placed secret and left out `as`. The hook sits on the kind, not in the shared wording, so `missing-keys.ts` stays free of integration rules (option (a) on the task).

## Tests

No test was weakened or skipped. `secret-words.test.ts` covers the four examples and that a client secret with only `purpose` still gets the sign-in check's own problem.

## Covers

- format.integration-secret-without-as
