# messenger.option-note

- Status: active
- Since: unreleased
- Source: HAL-18920, follow-up to HAL-18872 (approved by Liam on HAL-18872)

While a chat has no note field, the Messenger shall leave out of a card every option with `noteRequired`, so such an option is answered in the Inbox rather than sent without its note. It shall offer every other option, including one whose note is optional, as before. When it leaves an option out, the card shall say so under its options instead of "Also in your Inbox…": "Request changes needs a note: choose it in your Inbox.", or for several, "Request changes and Reject need a note: choose them in your Inbox." (HAL-19018).

## Examples

- Given a chat card with Approve, Reject and Request changes, where Request changes needs a note,
  when the chat shows the card,
  then it offers Approve and Reject only, says "Request changes needs a note: choose it in your Inbox." instead of "Also in your Inbox…", and Request changes is answered in the Inbox.
