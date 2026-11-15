# workflows.start.start-run

- Status: draft
- Since: 0.1.0
- Source: HAL-10208 (T7 PR 5b); states C18, C19, C25, C26, D7, D8

When the host can start runs, the workflows feature shall show **Run** at the right of the page's header on every tab, which opens a card docked at the right with the run's input as JSON (`{}` at first) and **Start run**; **Start run** shall ask the host to start the workflow's run with that input and, once it has, dock the run's simple card and show a strip above the canvas that names how the run stands in the Runs row's words ("Showing run 01jd8q · failed in Draft reply", "· done", "· budget reached in …", "· cancelled in …", "· running in …", "· waiting in …"), with a button that clears it; a failed run's step shall be ringed in danger with a **Failed** chip. An input that isn't a JSON object shall say so under the field and start nothing. When the start fails the card shall stay open with the input kept and say, in a danger Callout that takes focus, "Couldn't start the run: *reason*." with **Try again**, the reason being "the engine isn't answering. It may still be starting." when the host says the engine can't be reached (the words for where Studio runs). When the host can't start runs, the page shall show no **Run**.

## Examples

- Given a host that starts runs, then the header shows **Run**; given one that doesn't, it doesn't.
- Given the input `{"from": "a@example.com"}`, when the person presses **Start run**, then the host starts the workflow with that object.
- Given the engine isn't answering, then the card says "Couldn't start the run: the engine isn't answering. It may still be starting." with the input kept and **Try again**.
- Given the host fails with "The disk is full", then the card says "Couldn't start the run: The disk is full."
- Given the started run failed in `draft`, then the strip says "Showing run 01jd8q · failed in Draft" and the step `draft` is ringed with **Failed**.
- Given the input `[1]`, then the card says "The input has to be a JSON object, such as {}." and nothing starts.
