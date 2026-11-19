# Decision: Home's rows say which run they are

- Task: HAL-12615
- Approval: a team decision with no board card (HAL-2282 rule), building on the team's HAL-12461 decision (option a); Liam placed the scope on HAL-12615 and approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kCoHiNZ4JB5KRTLkGG8vrgckN7AbgufqmuMTWOvv2Jh3YcvzOt2Goxai35pV0JqZE8lN+6q1cWIpRno2Dq2zBQ==

## What changes

Sofia's keyboard and screen-reader check (HAL-12584, row H2) found that with two runs of one
workflow waiting, Home's rows read the same, on screen and to a screen reader.

- `inbox.home`: Needs you already said it shows the Inbox's rows as the Inbox page shows them, but
  its rows left out the run's workflow. Now both use one row builder, so a row reads
  "Approve this reply?" over "Support reply · a person step · Waiting 2 h", as in the Inbox. When
  HAL-12528 adds the run's id to the Inbox's line, Home gets it too. The requirement gains an
  example; its sentence is unchanged.
- `runs.home`: a Recent runs row is titled with its workflow and the run's short id, "Support reply
  · run 891b5a", the same short id the Runs list and `halonic runs` show. The row has no label of
  its own, so a screen reader hears that title first, as the Runs list's row starts with the run.

No new words beyond the HAL-12461 decision.

## Covers

- inbox.home
- runs.home
