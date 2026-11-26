# paperclip-client.web-link

- Status: active
- Since: unreleased
- Source: board report on HAL-10 via HAL-19362 ("I should be able to open the link to it"); plan approved by Liam on HAL-19367

When the connection's address is `https`, the Paperclip provider shall give every card a `webLink` to its task's page, `<address>/<prefix>/issues/<identifier>`, and every approval a `webLink` to its page, `<address>/<prefix>/approvals/<id>`, both with the site "Paperclip". The prefix shall come from the identifier of the approval's linked task, or, for an approval linked to no task, from the company's open tasks. Each part of the path shall be encoded, so no ID changes where the link goes. A connection to plain `http`, and an item whose prefix the provider can't tell, shall get no `webLink`.

## Examples

- Given a card on task ACME-7 of a connection to `https://paperclip.acme.test`,
  when the inbox is read,
  then the card's `webLink` is `https://paperclip.acme.test/ACME/issues/ACME-7` with the site "Paperclip".
- Given a pending approval `p-1` linked to no task,
  when the inbox is read,
  then its `webLink` is `https://paperclip.acme.test/ACME/approvals/p-1`.
- Given an approval whose ID holds `/` or `?`,
  when the inbox is read,
  then its link has them encoded and stays under `/ACME/approvals/`.
- Given a connection to `http://localhost:3100`,
  when the inbox is read,
  then no item has a `webLink`.
