# Decision: trust's other address refusals are said in plain words

- Approval: the task HAL-16301 asks for this change, from Liam's review of #5165 (HAL-16276); wording decided by the team under the HAL-2282 rule; Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:h9U91cVgS46Jar4HqjZ0lJeYwbW9flouHFdCq+xDiCHaYfuMxpGviAN0okUCnNQqrogsEdkFkA5wF+JjDwvVBg==

## What changes

The trust check's reasons for refusing a connector or provider address come from one place, `trustUrl`. #5165 said one of them in plain words ("the address has a user name or password in it"); the other three now say "address" too and drop URL terms:

- A backslash before the query: "the address has a backslash (\\) in it" instead of "the URL has a backslash before its query". The check only fires for a backslash before any `?` or `#`, so the shorter words are true whenever they are shown.
- No `//` after `http:` or `https:`: "the address is missing the // after http: or https:" instead of "the URL has no // after its scheme".
- `workspace.trust-url-hidden-characters`: "the address has a hidden character, such as a line break, or a space at its start or end" instead of "the URL has a hidden character, …". Only the quoted reason changes.

What is refused, when, and that the address is never shown stay as they were. No requirement is retired or weakened, and no example changes.

## Why

"Query" and "scheme" are URL terms most people don't know. Since #5165, `halonic validate` shows these reasons as well as `halonic trust`, `routines` and `run`, so a new user meets them in the check meant for fixing files. Saying "address" in all four reasons keeps them in one voice; a line that says "the address" for one refusal and "the URL" for the next reads as two different things.

## Tests

No test was weakened or skipped. `trust-url`, `trust-content` and `trust-providers` tests expect the new words; they make the same calls as before.

## Covers

- workspace.trust-url-hidden-characters
