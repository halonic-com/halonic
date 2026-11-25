# action-steppers.pasted-result

- Status: draft
- Since: unreleased
- Source: HAL-18169 (approvals stream HAL-17488, follow-up to PR 9b on HAL-17535); architecture note on HAL-17491, sections 7.1 and 7.6

When the user says a browser step with a result field is done, the stepper shall check what they pasted, trimmed, before anything is recorded. If it looks like a key, token or password, whatever the step's pattern says, the stepper shall say "This looks like a key: use the secure field." under the field and record nothing. If it doesn't match the step's anchored pattern, the stepper shall say "This doesn't match what the step asks for. Check it and paste it again." under the field and record nothing. Neither line shall repeat the value, and changing the field shall clear it. Otherwise the stepper shall record the step as done with the value as its kept field `result`, so the answer carries it; an empty field records the step as done with no `result`.

## Examples

- Given an `acme/app` variable request whose guided step 2 asks for the variable's name,
  when the user pastes `ACME_MODE` and says step 2 is done,
  then the answer's step 2 has `kept: { result: "ACME_MODE" }`.
- Given the same step,
  when the user pastes `acme mode` and clicks **Step 2 is done**,
  then the field says "This doesn't match what the step asks for. Check it and paste it again." and nothing is recorded.
- Given the same step,
  when the user pastes a value shaped like an access key, which the pattern would take,
  then the field says "This looks like a key: use the secure field.", nothing is recorded and the value is in no record and no answer.
