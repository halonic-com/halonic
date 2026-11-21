# shell.start-failure

- Status: draft
- Since: unreleased
- Source: HAL-12412 (UX check S1, S2, S4 and S6 of HAL-12390, rules E5 and N2; HAL-13758 for a lock another Halonic holds; design check C471-6 of HAL-14728), microcopy 22 F1 and F13

The shell shall word a run that didn't start in one function, `startFailureOf`, for every place that starts one: the Run panel, the run page's **Run again** and the Inbox's request form. Each place shall put its own lead before the reason. The reason shall be lower case after the lead's colon unless it starts with a name. A failure Halonic can't explain shall say "Halonic ran into a problem it can't explain yet." with **Copy details** and no **Try again**. A refusal with a next step shall show the step, and its command when it has one, without **Try again**, except a `conflict`: "Acme is already running in another Halonic on this computer." comes with "Stop that one, then try again." (HAL-13758) and **Try again**, because the other Halonic may have finished by then. Any other reason shall offer **Try again**, and **Copy details** when the error keeps raw text the reason replaces.

## Examples

- Given the engine can't be reached from a served Studio,
  when the start fails,
  then the reason is "Halonic on the server isn't answering." with **Try again**.
- Given a `TypeError` thrown while starting,
  when the start fails,
  then the reason is "Halonic ran into a problem it can't explain yet." with **Copy details** and no **Try again**.
- Given a `conflict` "Acme is already running in another Halonic on this computer." whose fix is "Stop that one, then try again.",
  when the start fails,
  then the reason keeps its capital, the fix is the second line, and **Try again** shows.
- Given an `unavailable` refusal whose fix leads to `halonic run reply`,
  when the start fails,
  then the fix and the command show and there is no **Try again**.
- Given an `unavailable` "Halonic can't write to its data folder." that keeps "Permission denied (os error 13)",
  when the start fails,
  then the reason keeps its capital, with **Try again** and **Copy details**, and only Copy details holds the raw text.
