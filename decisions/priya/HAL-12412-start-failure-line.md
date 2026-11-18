# Decision: Run again says a failed start with the Run panel's words and buttons

- Approval: HAL-12412, from Sofia's UX check S2 on HAL-12390; a team decision on an approved screen (HAL-2282)
- Kind: user-visible

The run page's **Run again** and the Run panel's **Start run** said a failed start in two
different ways. The UX check (row S2, rule E5) asks for one: the reason lower case after the colon
unless it starts with a name, the refusal's next step and its command, and **Try again**, from one
shared function. The requirement now says so, and its example changes from "Couldn't start the
run: The workflow changed." to "Couldn't start the run: the workflow changed.". A new example
covers a refusal's command.

## Tests

No test was weakened or removed. One expectation follows the new wording (lower case after the
colon); one test was added for a refusal's next step, its command and **Try again** for a conflict.

## Covers

- runs.run-view.run-again
