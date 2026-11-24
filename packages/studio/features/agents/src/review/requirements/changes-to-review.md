# agents.review.changes-to-review

- Status: active
- Since: unreleased
- Source: HAL-17121 (T14 PR 14a-3); AI changes 1.2, 1.3 and section 3; review panel notes 2 to 5; HAL-1307 plan, T14

When the assistant has changes to review in an agent's file, the agent page shall show the shell's item bar (`shell.item-review-bar`) in the line under its header, and a mark (`shell.change-mark`) for each change on Configuration: above the field it changed on Behaviour (description, instructions, output), Model (model, most model calls, more settings) and Harness (runs in), and at the top of its page for any other field, such as the name on Behaviour, the Tools lists, the subagents and each agent step on Agent steps; a change to the whole file shall be marked at the top of Behaviour. **Previous** and **Next** shall open the change's page and move the focus to its mark. **Accept** and **Reject** on a mark, and **Accept all** and **Reject all** on the bar, shall each be one decision, with a toast "Accepted 3 changes in Support triage" or "Rejected 1 change in Support triage" and **Undo**, which takes that decision back. On a file the assistant created, its mark's Reject shall say **Reject and delete file**. When the file changed outside Halonic since, a decision shall wait: the bar shall say "Changed outside Halonic" with **Compare**, which opens the agent's file, and the marks shall show no Accept or Reject. When an edit of the person's inside a change accepts it, the page shall say "Change accepted by your edit" politely. A review read before the file changed shall be read again without a word. A subagent's card shall show no marks, and where the app has no changes to review the page shall show neither bar nor marks.

## Examples

- Given the assistant changed the agent `sorter`'s name and model,
  when its page opens,
  then the bar says "The assistant changed 2 things here", and **Next** opens Configuration › Model with the focus on the mark "Model: small → large", above the model field.
- Given that page,
  when the person presses the model mark's **Accept**,
  then that change is accepted, a toast "Accepted 1 change in Sorter" has **Undo**, and **Undo** takes it back.
- Given that page,
  when the person presses **Reject all**,
  then the whole file is rejected, with the toast "Rejected 2 changes in Sorter".
- Given the assistant created `sorter`,
  when Behaviour shows,
  then its one mark "New" has **Reject and delete file**.
- Given the file changed outside Halonic,
  when the person presses **Accept all**,
  then the bar says "Changed outside Halonic", and **Compare** opens the agent's file.
- Given the person edits the description the assistant changed,
  when the edit accepts that change,
  then "Change accepted by your edit" is said politely.
- Given the app has no changes to review, then the page shows no bar.
