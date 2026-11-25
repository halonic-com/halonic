# paperclip-client.option-notes

- Status: active
- Since: unreleased
- Source: HAL-18920, follow-up to HAL-18872 (approved by Liam on HAL-18872); wording checked on HAL-18924

The Paperclip provider shall give every approval's Request changes option a required note labelled "What should change?". When a confirmation says `rejectRequiresReason`, the provider shall give its Reject option a required note labelled with the card's `rejectReasonLabel`, or "Why are you rejecting this?" when the card has none. Other options shall have no note. When a confirmation is bound to a document, the provider shall show the document's label on one line, and in a link shall escape `[`, `]` and `\`, so an agent's label can't end the line or the link.

## Examples

- Given a pending approval,
  when the inbox is read,
  then its Request changes option has a required note labelled "What should change?", and Approve and Reject have none.
- Given a confirmation with `rejectRequiresReason` and `rejectReasonLabel` "Why not now?",
  when the inbox is read,
  then its Reject option has a required note labelled "Why not now?".
- Given a confirmation bound to a document labelled "Plan\n] (evil)" with a web address,
  when the inbox is read,
  then the question's document line is "Document: [Plan \] (evil), revision 3](https://…)" on one line.
