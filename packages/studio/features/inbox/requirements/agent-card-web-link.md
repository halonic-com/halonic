# inbox.agent-card-web-link

- Status: active
- Since: unreleased
- Source: board report on HAL-10 via HAL-19362 ("Approval cards should have shadow and I should be able to open the link to it"); plan approved by Liam on HAL-19367

When an agent's inbox item has a `webLink`, its card in the Inbox shall show one link, "Open in _site_", that opens outside the app through the shell's external-link opener. The link shall go to the item's `answerElsewhere` link when it has one, else to its `webLink`, so a card never shows two page links. An item without a `webLink` shall show no such link. The card shall carry the kit's `shadow-1` elevation.

## Examples

- Given an open item with the `webLink` `https://paperclip.acme.test/ACME/issues/ACME-7` and the site "Paperclip",
  when its card shows,
  then it has one link "Open in Paperclip" to that page, and the card has `shadow-1`.
- Given an item with both `answerElsewhere` and `webLink`,
  when its card shows,
  then its one "Open in Paperclip" link goes to the `answerElsewhere` page.
- Given an item without a `webLink`,
  when its card shows,
  then it has no "Open in" link.
