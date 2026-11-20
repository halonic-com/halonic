# workflows.start.start-run

- Status: draft
- Since: unreleased
- Source: HAL-10208 (T7 PR 5b); HAL-12215 (W2, checklist 10.13); states C18, C19, C25, C26, D7, D8

When the host can start runs, the workflows feature shall show **Run** at the right of the page's header on every tab, which opens a card docked at the right, titled "Run *the workflow's name*", with the run's input as JSON and **Start run** and **Cancel**. The input starts as the first test's input with the line "Filled from the first test." under it, or as `{}` when the workflow has no test; **Start run** shall ask the host to start the workflow's run with that input and, once it has, dock the run's simple card and show a strip above the canvas that names how the run stands in the Runs row's words ("Showing run 01jd8q · failed in Draft reply", "· done", "· budget reached in …", "· cancelled in …", "· running in …", "· waiting in …"), with a button that clears it; until the runs list the new run, the dock shall say "Run started. Waiting for it to appear…" with a button that closes it; a failed run's step shall be ringed in danger with a **Failed** chip. The run's card shall offer **Run again** and **Open Models** on a failed banner as the run page does, and **Run again** shall dock the new run's card as **Start run** does. An input that isn't a JSON object shall say so under the field and start nothing. When the start fails the card shall stay open with the input kept and say, in a danger Callout that takes focus, "Couldn't start the run: *reason*." with **Try again**, the reason reading on after the colon as on the run page (a reason that starts with a common word such as "The" in lower case, any other first word, which may be a name, keeping its capital), the reason being "the engine isn't answering. It may still be starting." when the host says the engine can't be reached (the words for where Studio runs). When the host can't start runs, the page shall show no **Run**.

## Examples

- Given the workflow "Support reply" and a first test with the input `{"from": "a@example.com"}`, then the card is titled "Run Support reply", the input holds that JSON and "Filled from the first test." shows under it; when the person types, the line goes.
- Given the workflow has no test, then the input reads `{}` and no line shows.
- Given the card is open, when the person presses **Cancel**, then the card closes and nothing starts.
- Given a host that starts runs, then the header shows **Run**; given one that doesn't, it doesn't.
- Given the input `{"from": "a@example.com"}`, when the person presses **Start run**, then the host starts the workflow with that object.
- Given the engine isn't answering, then the card says "Couldn't start the run: the engine isn't answering. It may still be starting." with the input kept and **Try again**.
- Given the host fails with "The disk is full", then the card says "Couldn't start the run: the disk is full."
- Given the started run failed because Ollama wasn't running, then the run's card offers **Run again** and **Open Models** on its banner, as the run page does, and **Run again** starts the workflow with the run's input and docks the new run's card.
- Given the started run failed in `draft`, then the strip says "Showing run 01jd8q · failed in Draft" and the step `draft` is ringed with **Failed**.
- Given the host started the run but the runs don't list it yet, then the dock says "Run started. Waiting for it to appear…", and the run's card replaces it once they do.
- Given the input `[1]`, then the card says "The input has to be a JSON object, such as {}." and nothing starts.
