# Decision: a refused service's failed call gets its own line

- Approval: the plan is HAL-19172 rev 1 (Liam's OK, 26 Nov), the wording is Chief's team decision on HAL-19275 (26 Nov), the task is HAL-19186, and its reviewer approves this note in review
- Kind: internal
- Task: HAL-19186

## What changes

- `app.failed-call-line` gives a call with the outcome `error` and a `service-refused` cause
  (HAL-19185) a line of its own, by the cause's `why`, instead of the plain line for its outcome:
  - a token the service didn't accept;
  - a token without permission;
  - a request to slow down, saying whether Halonic tried again once or twice;
  - a host the integration doesn't list, named by its main part as code.
- The 429 line ends "Nothing was sent twice." only when the cause has `sentOnce: true`, never from
  the tool's risk alone (Liam's rule on HAL-19172).
- A host is now marked to look like code, as a tool, a program or a secret is.
- A refused call whose outcome is `unknown` keeps the `unknown` outcome's line ("…so it may or
  may not have done its work."). The engine logs `unknown` when an earlier write may already have
  gone through, so "try again" could do that work twice (Liam's PR 2 rule on HAL-19172). Naming
  the cause in that line too needs new words, so it's a follow-up.
- Three examples are added: the 429 line with and without `sentOnce`, the host line, and a
  refused call with the outcome `unknown`.
- No earlier line changes. A call without a cause still gets the `unknown` outcome's line or
  "Didn't work.".

## Why

Until now the requirement held these calls to the plain line until HAL-19186 brought their words.
Those words now exist, approved as written on HAL-19275. Only values from the log fill them: the
tool, its connector, the host's main part and the retry count. So no secret, query, header or
reply text reaches the line.

## Covers

- app.failed-call-line
