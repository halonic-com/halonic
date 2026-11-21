# Decision: Run again says a failed start with the Run panel's words and buttons

- Approval: HAL-12412, from Sofia's UX check S2 on HAL-12390; a team decision on an approved screen (HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cZuzfJsAORHzXmHQWOEwOwO7KVJyCHmzU70yLbQWSAj1S4BdbEgY3yOHHWXJDqd7+CbZYvvoNQcdtHbA3LhbDA==

The run page's **Run again** and the Run panel's **Start run** said a failed start in two
different ways. The UX check (row S2, rule E5) asks for one: the reason lower case after the colon
unless it starts with a name, the refusal's next step and its command, and **Try again**, from one
shared function. The requirement now says so, and a new example covers a refusal's next step and
its command, which come without **Try again**. A lock another Halonic holds is worded as HAL-13758
decided and keeps **Try again**, because the other Halonic may have finished by then (UX check S1,
design check C471-6 on HAL-14728).

## Tests

No test was weakened or removed. One test was added for a refusal's next step and its command,
without **Try again**, and a lock another Halonic holds, with **Try again**.
The Run card's Problems tests moved from `start-run.test.tsx` to their own file,
`start-run-problems.test.tsx`, unchanged, so `start-run.test.tsx` stays under the file-size limit.

## Covers

- runs.run-view.run-again
- packages/studio/features/workflows/src/start/start-run.test.tsx
