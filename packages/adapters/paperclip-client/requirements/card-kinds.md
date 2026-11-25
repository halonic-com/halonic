# paperclip-client.card-kinds

- Status: active
- Since: unreleased
- Source: HAL-18861 (board ask on HAL-10: every Paperclip card works in Inbox and Messenger); gap table and design by Liam; task HAL-18871

The Paperclip provider shall map a `request_checkbox_confirmation` card to an inbox item with one `multiple` question `options` listing the card's options, required when `minSelected` is above 0; a `request_item_verdicts` card to one optional `single` question per item not yet resolved, whose options are the card's `verdicts` (approve and reject when it lists none); and a `suggest_tasks` card to one required `multiple` question `tasks` listing its tasks by `clientKey` and title, with the card's title as its question. A checkbox or task card's item offers one option next to its question, `reject`, labelled with the card's `rejectLabel` (Reject when it has none) and marked `noteRequired` when the card sets `rejectRequiresReason`; a verdict card's item has no `options`. A checkbox card's `defaultSelectedOptionIds` become its question's `preselected`.
When the person answers with an `answers` answer that fits, the provider shall send `acceptCard` with `selectedOptionIds` for a checkbox card (only when the count is within `minSelected` and `maxSelected`), `acceptCard` with `selectedClientKeys` for a task card, and `submitVerdicts` with `{ id, verdict }` for each answered item, plus its text as `reason`, for a verdict card, where a verdict the card lists in `requireReasonOn` (reject when it lists none) needs a reason. The `reject` option rejects a checkbox or task card with its note as `reason`, and needs a note when the card sets `rejectRequiresReason`. The provider shall send nothing for any other answer.
A card of a kind the provider can't answer shall carry `answerElsewhere`, a link to its task's page in Paperclip (by the task's identifier when known), and no options, when the connection is `https`. The provider shall leave out any card whose item doesn't hold together (`inboxItemFits`).
A resolved card shall read back as an `answers` answer with the options, tasks or verdicts chosen, or, when rejected, as the `reject` option with its reason as note.

## Examples

- Given a pending checkbox card with three options and `minSelected: 1`,
  when the inbox is read,
  then the item has one required `multiple` question with those options, and no options.
- Given that checkbox card,
  when the person picks `draft` and `export`,
  then Paperclip gets `acceptCard` with `{ selectedOptionIds: ["draft", "export"] }`.
- Given that checkbox card with `rejectRequiresReason`,
  when the person rejects it with "Keep the draft",
  then Paperclip gets `rejectCard` with `{ reason: "Keep the draft" }`; without a note nothing is sent.
- Given a verdict card with two items,
  when the person rejects only `setup` with "Add the install step",
  then Paperclip gets `submitVerdicts` with that one verdict and its reason.
- Given a verdict card where a partial submit resolved `intro`,
  when the inbox is read,
  then the item asks only about `setup`.
- Given a task card with two tasks,
  when the person picks `write`,
  then Paperclip gets `acceptCard` with `{ selectedClientKeys: ["write"] }`.
- Given a pending card of a kind the provider can't answer on task ACME-7,
  when the inbox is read,
  then the item links to `https://paperclip.acme.test/ACME/issues/ACME-7` and has no options.
- Given a checkbox card whose default names an option it doesn't offer,
  when the inbox is read,
  then the card is left out.
